import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { MAX_STREAMS_PER_USER } from "../src/live/hub.js";
import { LIVE_APPLICATION_NAME, parseLiveEvent, startLiveListener, type LiveListener } from "../src/live/listener.js";
import { type Agent, cleanupUsers, createProduct, orderOne, PASSWORD, registerAndLogin, userId } from "./helpers.js";

// SSE (delivery phase 2): GET /api/events streams "something changed" events, sent by the
// database triggers of migration 044 once a transaction commits, to the order's two parties and
// to a notification's user.
const STORE = "live-events-store@test.com";
const RESTAURANT = "live-events-restaurant@test.com";
const OTHER = "live-events-other@test.com";

interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

interface Stream {
  events: StreamEvent[];
  ended: Promise<void>;
  waitFor: (match: (event: StreamEvent) => boolean) => Promise<StreamEvent>;
  close: () => void;
}

let server: http.Server;
let baseUrl: string;
let listener: LiveListener;
let store: Agent;
let restaurant: Agent;
let streams: Stream[] = [];

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  listener = startLiveListener({ retryMs: 100 });
  await listener.ready;
});

afterAll(async () => {
  await listener.stop();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  await registerAndLogin(OTHER, "RESTAURANT");
});

afterEach(async () => {
  for (const stream of streams) stream.close();
  streams = [];
  await cleanupUsers([STORE, RESTAURANT, OTHER]);
});

const loginCookie = async (email: string) => {
  const response = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
};

// Opens the stream as the user and resolves once its `ready` event arrived (it is then
// registered, so later events reach it).
const openStream = async (email: string): Promise<Stream> => {
  const cookie = await loginCookie(email);
  const events: StreamEvent[] = [];
  const waiters: { match: (event: StreamEvent) => boolean; resolve: (event: StreamEvent) => void }[] = [];
  let endStream: () => void;
  const ended = new Promise<void>((resolve) => {
    endStream = resolve;
  });
  const req = http.get(`${baseUrl}/api/events`, { headers: { cookie } });
  const stream: Stream = {
    events,
    ended,
    waitFor: (match) => {
      const found = events.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve) => waiters.push({ match, resolve }));
    },
    close: () => req.destroy(),
  };
  streams.push(stream);
  await new Promise<void>((resolve, reject) => {
    req.on("error", () => endStream());
    req.on("response", (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
      let buffer = "";
      res.setEncoding("utf8");
      res.on("end", () => endStream());
      res.on("close", () => endStream());
      res.on("data", (chunk: string) => {
        buffer += chunk;
        let split: number;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (!name || !data) continue;
          const event = { event: name, data: JSON.parse(data) as Record<string, unknown> };
          events.push(event);
          for (const waiter of waiters.filter((w) => w.match(event))) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(event);
          }
          if (name === "ready") resolve();
        }
      });
    });
    req.on("error", reject);
  });
  return stream;
};

const isOrder = (orderId: number) => (event: StreamEvent) => event.event === "order" && event.data.order_id === orderId;
const isNotification = (event: StreamEvent) => event.event === "notification";

const orderIdOf = async (itemId: number) =>
  (await pool.query<{ order_id: number }>("SELECT order_id FROM order_items WHERE id = $1", [itemId])).rows[0]!
    .order_id;

describe("GET /api/events", () => {
  it("needs a login", async () => {
    const response = await request(app).get("/api/events");
    expect(response.status).toBe(401);
  });

  it("sends a new order to both parties with the store's notification, and nothing to anyone else", async () => {
    const storeStream = await openStream(STORE);
    const restaurantStream = await openStream(RESTAURANT);
    const otherStream = await openStream(OTHER);
    const product = await createProduct(store, { quantity: 10 });

    const orderId = await orderIdOf(await orderOne(restaurant, product.id, 2));

    await storeStream.waitFor(isOrder(orderId));
    await storeStream.waitFor(isNotification);
    await restaurantStream.waitFor(isOrder(orderId));
    // The store's notification (ORDER_CREATED) committed with the order; the other user's stream
    // has had the same time to receive anything.
    expect(otherStream.events.map((event) => event.event)).toEqual(["ready"]);
    expect(restaurantStream.events.some(isNotification)).toBe(false);
  });

  it("sends one event per order for a transaction that changes several items, after the commit", async () => {
    const first = await createProduct(store, { quantity: 10 });
    const second = await createProduct(store, { quantity: 10 });
    const sent = await restaurant.post("/api/orders").send({
      pickup_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      items: [
        { product_id: first.id, quantity: 1, unit_price: 5 },
        { product_id: second.id, quantity: 1, unit_price: 5 },
      ],
    });
    expect(sent.status).toBe(201);
    const orderId = sent.body.order.id as number;
    const restaurantStream = await openStream(RESTAURANT);

    const decided = await store.post(`/api/orders/${orderId}/decision`).send({
      items: sent.body.order.items.map((item: { id: number }) => ({ item_id: item.id, action: "ACCEPT" })),
    });
    expect(decided.status).toBe(200);

    // ORDER_ACCEPTED commits with the decision, so its event comes after the order's.
    await restaurantStream.waitFor(isNotification);
    expect(restaurantStream.events.filter(isOrder(orderId))).toHaveLength(1);
  });

  it("sends nothing for a rolled-back change", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const orderId = await orderIdOf(await orderOne(restaurant, product.id, 1));
    const storeStream = await openStream(STORE);
    const storeId = await userId(STORE);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE orders SET accept_partial = true WHERE id = $1", [orderId]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    // Events arrive in commit order: had the rollback sent one, it would come before this one.
    await pool.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'ORDER_CREATED', 'x')", [storeId]);

    await storeStream.waitFor(isNotification);
    expect(storeStream.events.some(isOrder(orderId))).toBe(false);
  });

  it(`closes a user's oldest stream past ${MAX_STREAMS_PER_USER}`, async () => {
    const oldest = await openStream(STORE);
    for (let i = 1; i < MAX_STREAMS_PER_USER; i++) await openStream(STORE);

    await openStream(STORE);

    await oldest.ended;
  });

  it("sends resync after the listener's database connection was lost", async () => {
    const storeStream = await openStream(STORE);

    await pool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND datname = current_database()",
      [LIVE_APPLICATION_NAME],
    );

    await storeStream.waitFor((event) => event.event === "resync");
    // And it listens again.
    await pool.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'ORDER_CREATED', 'x')", [
      await userId(STORE),
    ]);
    await storeStream.waitFor(isNotification);
  });
});

describe("parseLiveEvent", () => {
  it("reads the triggers' payloads", () => {
    expect(parseLiveEvent('{"kind":"order","order_id":7,"user_ids":[3,5]}')).toEqual({
      userIds: [3, 5],
      event: { kind: "order", order_id: 7 },
    });
    expect(parseLiveEvent('{"kind":"notification","user_ids":[3]}')).toEqual({
      userIds: [3],
      event: { kind: "notification" },
    });
  });

  it("drops anything else", () => {
    for (const payload of [
      undefined,
      "",
      "not json",
      "null",
      "[]",
      '{"kind":"order","user_ids":[3]}',
      '{"kind":"order","order_id":"7","user_ids":[3]}',
      '{"kind":"notification","user_ids":["3"]}',
      '{"kind":"notification"}',
      '{"kind":"resync","user_ids":[3]}',
    ]) {
      expect(parseLiveEvent(payload)).toBeNull();
    }
  });
});
