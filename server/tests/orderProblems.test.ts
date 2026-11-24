import pool from "../src/config/db.js";
import {
  type Agent,
  acceptItem,
  cleanupUsers,
  createProduct,
  orderOf,
  orderOne,
  registerAndLogin,
  userId,
} from "./helpers.js";

// Problem reports: the order's restaurant reports (reason by method, optional text), from sending
// until 48 hours after the order finished, several per order; every admin is told; an admin lists
// them, sets a status and replies; the restaurant is told about a reply and a resolution.
const STORE = "order-problems-store@test.com";
const RESTAURANT = "order-problems-restaurant@test.com";
const OTHER = "order-problems-other@test.com";
const ADMIN = "order-problems-admin@test.com";

let store: Agent;
let restaurant: Agent;
let admin: Agent;
let restaurantId: number;
let adminId: number;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  admin = await registerAndLogin(ADMIN, "ADMIN");
  restaurantId = await userId(RESTAURANT);
  adminId = await userId(ADMIN);
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, OTHER, ADMIN]);
});

const pickupOrder = async () => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  const itemId = await orderOne(restaurant, product.id, 2);
  return { itemId, orderId: await orderOf(itemId) };
};

const report = (orderId: number, body: object, agent: Agent = restaurant) => agent.post(`/api/orders/${orderId}/problems`).send(body);

const notificationsOf = async (id: number) =>
  (
    await pool.query<{ type: string; details: string | null; order_id: number }>(
      "SELECT type, details, order_id FROM notifications WHERE user_id = $1 ORDER BY id",
      [id],
    )
  ).rows;

describe("POST /api/orders/:id/problems", () => {
  it("stores a report with the order's method, tells every admin, and allows several per order", async () => {
    const { orderId } = await pickupOrder();
    const response = await report(orderId, { reason: "PICKUP_TIME", text: "  Prodavnica je bila zatvorena.  " });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Problem reported.");
    expect(response.body.problem).toMatchObject({
      order_id: orderId,
      fulfilment_method: "PICKUP",
      reason: "PICKUP_TIME",
      text: "Prodavnica je bila zatvorena.",
      status: "OPEN",
      admin_reply: null,
    });
    expect(await notificationsOf(adminId)).toEqual([
      { type: "ORDER_PROBLEM_REPORTED", details: "Prodavnica je bila zatvorena.", order_id: orderId },
    ]);
    // The admin's email opens the admin's list.
    const email = await pool.query<{ template: string }>("SELECT template FROM email_queue WHERE user_id = $1", [adminId]);
    expect(email.rows.map((row) => row.template)).toEqual(["ORDER_PROBLEM_REPORTED"]);

    const second = await report(orderId, { reason: "OTHER" });
    expect(second.status).toBe(201);
    expect(second.body.problem.text).toBeNull();
    const order = (await restaurant.get(`/api/orders/${orderId}`)).body.order;
    expect(order.problems.map((problem: { reason: string }) => problem.reason)).toEqual(["PICKUP_TIME", "OTHER"]);
  });

  it("checks the reason against the order's method and the text's length", async () => {
    const { orderId } = await pickupOrder();
    for (const reason of [undefined, "LATE", "COURIER", "PAYMENT", "teleport", 3]) {
      const response = await report(orderId, { reason });
      expect(response.status, String(reason)).toBe(400);
      expect(response.body.error).toBe("Choose a reason.");
    }
    const long = await report(orderId, { reason: "OTHER", text: "x".repeat(1001) });
    expect(long.status).toBe(400);
    expect(long.body.error).toBe("Describe the problem (at most 1000 characters).");
    expect((await report(orderId, { reason: "OTHER", text: 5 })).status).toBe(400);
    expect((await report(orderId, { reason: "OTHER", text: "x".repeat(1000) })).status).toBe(201);
    for (const reason of ["MISSING_ITEM", "DAMAGED", "STORE"]) expect((await report(orderId, { reason })).status).toBe(201);
  });

  it("delivery orders take the delivery reasons", async () => {
    const { orderId } = await pickupOrder();
    await pool.query(
      `UPDATE orders SET fulfilment_method = 'DELIVERY', delivery_address = 'Butmirska 2, Sarajevo', delivery_latitude = 43.8,
         delivery_longitude = 18.3, delivery_fee_estimate = 5, delivery_estimated_at = NOW() WHERE id = $1`,
      [orderId],
    );
    expect((await report(orderId, { reason: "PICKUP_TIME" })).status).toBe(400);
    expect((await report(orderId, { reason: "STORE" })).status).toBe(400);
    for (const reason of ["LATE", "MISSING_ITEM", "DAMAGED", "COURIER", "PAYMENT", "OTHER"]) {
      const response = await report(orderId, { reason });
      expect(response.status, reason).toBe(201);
      expect(response.body.problem.fulfilment_method).toBe("DELIVERY");
    }
  });

  it("is only for the order's restaurant", async () => {
    const { orderId } = await pickupOrder();
    expect((await report(orderId, { reason: "OTHER" }, store)).status).toBe(403);
    expect((await report(orderId, { reason: "OTHER" }, admin)).status).toBe(403);
    const other = await registerAndLogin(OTHER, "RESTAURANT");
    const refused = await report(orderId, { reason: "OTHER" }, other);
    expect(refused.status).toBe(404);
    expect(refused.body.error).toBe("Order not found.");
    expect((await report(999999999, { reason: "OTHER" })).status).toBe(404);
  });

  it("is possible until 48 hours after the order finished", async () => {
    const { itemId, orderId } = await pickupOrder();
    await acceptItem(store, itemId);
    expect((await store.post(`/api/orders/${orderId}/complete`)).status).toBe(200);
    expect((await report(orderId, { reason: "DAMAGED" })).status).toBe(201);
    await pool.query(
      "UPDATE order_status_history SET created_at = NOW() - INTERVAL '47 hours' WHERE order_id = $1 AND to_status = 'Completed'",
      [orderId],
    );
    expect((await report(orderId, { reason: "DAMAGED" })).status).toBe(201);
    await pool.query(
      "UPDATE order_status_history SET created_at = NOW() - INTERVAL '49 hours' WHERE order_id = $1 AND to_status = 'Completed'",
      [orderId],
    );
    const late = await report(orderId, { reason: "DAMAGED" });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe("A problem can be reported until 48 hours after the order is finished.");
    expect((await restaurant.get(`/api/orders/${orderId}`)).body.order.can_report_problem).toBe(false);

    // A cancelled order too, by its cancel.
    const cancelled = await pickupOrder();
    expect((await restaurant.post(`/api/orders/${cancelled.orderId}/cancel`)).status).toBe(200);
    expect((await report(cancelled.orderId, { reason: "OTHER" })).status).toBe(201);
    await pool.query("UPDATE order_status_history SET created_at = NOW() - INTERVAL '3 days' WHERE order_id = $1", [
      cancelled.orderId,
    ]);
    expect((await report(cancelled.orderId, { reason: "OTHER" })).status).toBe(400);
  });
});

describe("admin problem reports", () => {
  const twoReports = async () => {
    const { orderId } = await pickupOrder();
    const first = (await report(orderId, { reason: "DAMAGED", text: "Polomljena ambalaža." })).body.problem;
    const second = (await report(orderId, { reason: "OTHER" })).body.problem;
    return { orderId, first, second };
  };

  it("lists the reports newest first with the order, both businesses and a status filter", async () => {
    const { orderId, first, second } = await twoReports();
    const list = await admin.get("/api/admin/problems");
    expect(list.status).toBe(200);
    expect(list.body.message).toBe("Problem reports fetched successfully.");
    const mine = list.body.problems.filter((problem: { order_id: number }) => problem.order_id === orderId);
    expect(mine.map((problem: { id: number }) => problem.id)).toEqual([second.id, first.id]);
    expect(mine[1]).toMatchObject({
      order_code: expect.stringMatching(/^[A-Z2-9]{4}$/),
      restaurant_id: restaurantId,
      restaurant_name: "Test Business",
      store_name: "Test Business",
      reason: "DAMAGED",
      text: "Polomljena ambalaža.",
      status: "OPEN",
    });
    expect(list.body.total).toBeGreaterThanOrEqual(2);

    await admin.patch(`/api/admin/problems/${first.id}`).send({ status: "RESOLVED" });
    const resolved = await admin.get("/api/admin/problems?status=RESOLVED");
    expect(resolved.body.problems.map((problem: { id: number }) => problem.id)).toContain(first.id);
    expect(resolved.body.problems.map((problem: { id: number }) => problem.id)).not.toContain(second.id);
    const open = await admin.get("/api/admin/problems?status=OPEN&limit=1");
    expect(open.body.problems).toHaveLength(1);
    expect((await admin.get("/api/admin/problems?status=DONE")).status).toBe(400);
    expect((await admin.get("/api/admin/problems?limit=0")).status).toBe(400);
    expect((await restaurant.get("/api/admin/problems")).status).toBe(403);
  });

  it("sets a status and a reply, tells the restaurant about a reply and a resolution, and logs it", async () => {
    const { orderId, first } = await twoReports();
    const progress = await admin.patch(`/api/admin/problems/${first.id}`).send({ status: "IN_PROGRESS" });
    expect(progress.status).toBe(200);
    expect(progress.body.message).toBe("Problem report updated.");
    expect(progress.body.problem).toMatchObject({ status: "IN_PROGRESS", admin_reply: null, resolved_at: null });
    // A status alone tells the restaurant nothing.
    expect(await notificationsOf(restaurantId)).toEqual([]);

    const replied = await admin.patch(`/api/admin/problems/${first.id}`).send({ reply: "Kontaktirali smo prodavnicu." });
    expect(replied.body.problem).toMatchObject({
      status: "IN_PROGRESS",
      admin_reply: "Kontaktirali smo prodavnicu.",
      replied_at: expect.any(String),
    });
    expect(await notificationsOf(restaurantId)).toEqual([
      { type: "ORDER_PROBLEM_REPLIED", details: "Kontaktirali smo prodavnicu.", order_id: orderId },
    ]);

    const resolved = await admin
      .patch(`/api/admin/problems/${first.id}`)
      .send({ status: "RESOLVED", reply: "Prodavnica vraća novac." });
    expect(resolved.body.problem).toMatchObject({
      status: "RESOLVED",
      admin_reply: "Prodavnica vraća novac.",
      resolved_at: expect.any(String),
      resolved_by_email: ADMIN,
    });
    const types = (await notificationsOf(restaurantId)).map((row) => row.type);
    expect(types).toEqual(["ORDER_PROBLEM_REPLIED", "ORDER_PROBLEM_RESOLVED"]);

    // The restaurant sees the answer on its order.
    const order = (await restaurant.get(`/api/orders/${orderId}`)).body.order;
    expect(order.problems[0]).toMatchObject({ status: "RESOLVED", admin_reply: "Prodavnica vraća novac." });

    // Reopening clears the resolution and tells nothing.
    const reopened = await admin.patch(`/api/admin/problems/${first.id}`).send({ status: "OPEN" });
    expect(reopened.body.problem).toMatchObject({ status: "OPEN", resolved_at: null, resolved_by_email: null });
    expect(await notificationsOf(restaurantId)).toHaveLength(2);

    const actions = await pool.query<{ action: string; target_order_id: number; reason: string }>(
      "SELECT action, target_order_id, reason FROM admin_actions WHERE admin_id = $1 ORDER BY id",
      [adminId],
    );
    expect(actions.rows.map((row) => row.reason)).toEqual(["IN_PROGRESS", "IN_PROGRESS", "RESOLVED", "OPEN"]);
    expect(actions.rows.every((row) => row.action === "UPDATE_ORDER_PROBLEM" && row.target_order_id === orderId)).toBe(true);
  });

  it("validates the update", async () => {
    const { first } = await twoReports();
    const cases: [object, string][] = [
      [{}, "Choose a status or write a reply."],
      [{ status: "DONE" }, "Status is not valid."],
      [{ reply: "x".repeat(1001) }, "The reply can be at most 1000 characters long."],
      [{ reply: 7 }, "The reply can be at most 1000 characters long."],
    ];
    for (const [body, error] of cases) {
      const response = await admin.patch(`/api/admin/problems/${first.id}`).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toBe(error);
    }
    const missing = await admin.patch("/api/admin/problems/999999999").send({ status: "OPEN" });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Problem report not found.");
    expect((await restaurant.patch(`/api/admin/problems/${first.id}`).send({ status: "OPEN" })).status).toBe(403);
  });
});
