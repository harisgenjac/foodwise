import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, futureDate, insertOrderItem, registerAndLogin, userId, type Agent } from "./helpers.js";

const STORE = "store-home-store@test.com";
const OTHER_STORE = "store-home-other@test.com";
const RESTAURANT = "store-home-restaurant@test.com";

// Local wall-clock times, so the tests do not depend on the hour they run at (except the last minute
// of the day): midnight today has passed, 23:59 today has not.
const TODAY_PASSED = "date_trunc('day', LOCALTIMESTAMP)";
const TODAY_AHEAD = "date_trunc('day', LOCALTIMESTAMP) + INTERVAL '23 hours 59 minutes'";
const YESTERDAY = "date_trunc('day', LOCALTIMESTAMP) - INTERVAL '14 hours'";
const TOMORROW = "date_trunc('day', LOCALTIMESTAMP) + INTERVAL '34 hours'";

// Makes an inserted order a delivery order with the store's ready time.
const makeDelivery = async (orderId: number, readyAt: string) => {
  await pool.query(
    `UPDATE orders SET fulfilment_method = 'DELIVERY', ready_at = (${readyAt}) AT TIME ZONE current_setting('TimeZone'),
       delivery_address = 'Titova 1', delivery_latitude = 43.85, delivery_longitude = 18.41,
       delivery_fee_estimate = 5, delivery_estimated_at = NOW()
     WHERE id = $1`,
    [orderId],
  );
};

describe("GET /api/stats/store-home", () => {
  let store: Agent;
  let restaurantId: number;

  const home = async () => {
    const response = await store.get("/api/stats/store-home");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Store home fetched successfully.");
    return response.body;
  };

  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    await registerAndLogin(RESTAURANT, "RESTAURANT");
    restaurantId = await userId(RESTAURANT);
  });

  afterEach(async () => {
    await cleanupUsers([STORE, OTHER_STORE, RESTAURANT]);
  });

  it("counts every order in at most one Danas card, by its ready time", async () => {
    const product = await createProduct(store, { unit: "kg", quantity: 100 });
    const order = (status: string, pickupAt: string) =>
      insertOrderItem({ productId: product.id, restaurantId, quantity: 1, status, pickupAt });

    await order("Pending", TOMORROW);
    await order("Pending", TODAY_AHEAD);
    await order("Confirmed", TODAY_AHEAD); // to prepare
    await order("Confirmed", TODAY_PASSED); // to hand over, in person
    await order("Confirmed", YESTERDAY); // a missed pickup: to hand over, in person
    const courier = await order("Confirmed", TOMORROW);
    await makeDelivery(courier.orderId, TODAY_PASSED); // ready for the courier
    const later = await order("Confirmed", TOMORROW);
    await makeDelivery(later.orderId, TODAY_AHEAD); // a delivery still to prepare
    // Not in any card: tomorrow's pickup, a delivery the courier has, finished ones.
    await order("Confirmed", TOMORROW);
    const onTheWay = await order("Confirmed", TOMORROW);
    await makeDelivery(onTheWay.orderId, TODAY_PASSED);
    await pool.query("UPDATE orders SET status = 'InDelivery' WHERE id = $1", [onTheWay.orderId]);
    for (const status of ["Completed", "Rejected", "Cancelled"]) await order(status, TODAY_PASSED);

    const { today } = await home();
    expect(today).toMatchObject({ pending: 2, to_prepare: 2, hand_over_pickup: 2, hand_over_courier: 1 });
    expect(new Date(today.first_ready_at).getHours()).toBe(23);
    expect(today.first_deadline).not.toBeNull();
  });

  it("lists the three most urgent pending orders, the closest automatic rejection first, with all items", async () => {
    const product = await createProduct(store, { unit: "kg", quantity: 100 });
    const pending = (pickupAt: string, createdAt = "NOW()") =>
      insertOrderItem({ productId: product.id, restaurantId, quantity: 1, status: "Pending", pickupAt, createdAt });

    const tomorrow = await pending(TOMORROW);
    const today = await pending(TODAY_AHEAD);
    // A delivery order is rejected 15 minutes after it was sent: the most urgent.
    const delivery = await pending(TOMORROW, "NOW() - INTERVAL '5 minutes'");
    await makeDelivery(delivery.orderId, TODAY_AHEAD);
    await pending(`${TOMORROW} + INTERVAL '1 hour'`); // the fourth
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, restaurant_id, quantity, ordered_quantity, unit_price, status)
       VALUES ($1, $2, $3, 2, 2, 5, 'Pending')`,
      [delivery.orderId, (await createProduct(store, { name: "Mlijeko" })).id, restaurantId],
    );
    // Another store's order is not this store's.
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    const foreign = await createProduct(other);
    await insertOrderItem({ productId: foreign.id, restaurantId, quantity: 1, status: "Pending", pickupAt: TODAY_PASSED });

    const { orders } = await home();
    expect(orders.map((row: { id: number }) => row.id)).toEqual([delivery.orderId, today.orderId, tomorrow.orderId]);
    expect(orders[0].items).toHaveLength(2);
    expect(orders[0]).toMatchObject({ business_name: expect.any(String), fulfilment_method: "DELIVERY", item_count: 2 });
    expect(orders[0].auto_reject_at).not.toBeNull();
  });

  it("lists the four available products that expire soonest, with what is free and what orders hold", async () => {
    const make = (name: string, days: number) => createProduct(store, { name, quantity: 10, unit: "kg", expiry_date: futureDate(days) });
    const today = await make("Danas", 0);
    const two = await make("Dva dana", 2);
    const one = await make("Sutra", 1);
    const five = await make("Pet dana", 5);
    await make("Deset dana", 10); // the fifth
    const soldOut = await make("Rasprodano", 0);
    await insertOrderItem({ productId: soldOut.id, restaurantId, quantity: 10, status: "Confirmed" });
    const removed = await make("Uklonjeno", 0);
    await pool.query("UPDATE products SET status = 'Removed' WHERE id = $1", [removed.id]);
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    await createProduct(other, { expiry_date: futureDate(0) });
    await insertOrderItem({ productId: today.id, restaurantId, quantity: 3, status: "Pending" });
    await insertOrderItem({ productId: today.id, restaurantId, quantity: 1, status: "Completed" });

    const body = await home();
    expect(body.products.map((row: { id: number }) => row.id)).toEqual([today.id, one.id, two.id, five.id]);
    expect(Number(body.products[0].available_quantity)).toBe(6);
    expect(Number(body.products[0].reserved_quantity)).toBe(3);
    expect(body.products[0].days_until_expiry).toBe(0);
    expect(body.today.expiring_today).toBe(1);
  });

  it("shows zeros and empty lists to a new store", async () => {
    expect(await home()).toMatchObject({
      today: { pending: 0, first_deadline: null, to_prepare: 0, first_ready_at: null, hand_over_courier: 0, hand_over_pickup: 0, expiring_today: 0 },
      orders: [],
      products: [],
    });
  });

  it("is only for stores", async () => {
    expect((await request(app).get("/api/stats/store-home")).status).toBe(401);
    const restaurant = await registerAndLogin("store-home-restaurant-2@test.com", "RESTAURANT");
    try {
      const response = await restaurant.get("/api/stats/store-home");
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You do not have the required role for this action.");
    } finally {
      await cleanupUsers(["store-home-restaurant-2@test.com"]);
    }
  });
});
