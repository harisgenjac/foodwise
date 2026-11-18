import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  insertOrderItem,
  login,
  registerAndLogin,
  userId,
  type Agent,
} from "./helpers.js";

const STORE_A = "packing-store-a@test.com";
const STORE_B = "packing-store-b@test.com";
const RESTAURANT = "packing-restaurant@test.com";

let store: Agent;

// A one-item order with a chosen status and a pickup at `time` on CURRENT_DATE + `days`.
const insertItem = async (
  productId: number,
  { status = "Confirmed", days = 0, time = "10:00", quantity = 2 }: {
    status?: string;
    days?: number;
    time?: string;
    quantity?: number;
  } = {},
) => {
  const { orderId, itemId } = await insertOrderItem({
    productId,
    restaurantId: await userId(RESTAURANT),
    quantity,
    status,
    pickupAt: `(CURRENT_DATE + ${Number(days)}) + '${time}'::time`,
  });
  return { orderId, itemId };
};

// Turns an order into a delivery order whose goods are ready at local `time` on CURRENT_DATE + `days`.
const makeDelivery = async (orderId: number, { days = 0, time }: { days?: number; time: string }) => {
  await pool.query(
    `UPDATE orders SET fulfilment_method = 'DELIVERY', delivery_address = 'Ferhadija 1',
       delivery_latitude = 43.859, delivery_longitude = 18.425, delivery_fee_estimate = 5,
       delivery_estimated_at = pickup_at,
       ready_at = ((CURRENT_DATE + ${Number(days)}) + $2::time) AT TIME ZONE current_setting('TimeZone')
     WHERE id = $1`,
    [orderId, time],
  );
};

const ids = (body: { orders: { id: number }[] }) => body.orders.map((order) => order.id);

describe("GET /api/orders/packing", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  it("lists today's accepted orders by ready time: a delivery's ready time, a pickup's pickup time", async () => {
    const product = await createProduct(store, { quantity: 50 });
    const late = await insertItem(product.id, { time: "23:59:59" });
    const early = await insertItem(product.id, { time: "00:00:01" });
    // A delivery ready at noon whose courier comes tomorrow is packed today.
    const delivery = await insertItem(product.id, { days: 1, time: "09:00" });
    await makeDelivery(delivery.orderId, { time: "12:00" });

    const response = await store.get("/api/orders/packing");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Packing list fetched successfully.");
    expect(ids(response.body)).toEqual([early.orderId, delivery.orderId, late.orderId]);
    expect(response.body.orders[1]).toMatchObject({ fulfilment_method: "DELIVERY" });
    expect(new Date(response.body.orders[1].ready_time).getTime()).toBe(
      new Date(response.body.orders[1].ready_at).getTime(),
    );
  });

  it("leaves out other days, orders not accepted or already handed over, and other stores' orders", async () => {
    const product = await createProduct(store, { quantity: 50 });
    await insertItem(product.id, { days: 1 });
    await insertItem(product.id, { days: -1 });
    await insertItem(product.id, { status: "Pending" });
    await insertItem(product.id, { status: "Rejected" });
    await insertItem(product.id, { status: "Cancelled" });
    await insertItem(product.id, { status: "Completed" });
    const inDelivery = await insertItem(product.id, { status: "InDelivery" });
    await makeDelivery(inDelivery.orderId, { time: "12:00" });
    // A delivery ready tomorrow is not today's, even with a courier pickup today.
    const tomorrow = await insertItem(product.id);
    await makeDelivery(tomorrow.orderId, { days: 1, time: "08:00" });
    const otherStore = await registerAndLogin(STORE_B, "STORE");
    const otherProduct = await createProduct(otherStore);
    await insertItem(otherProduct.id);

    const response = await store.get("/api/orders/packing");
    expect(response.body.orders).toEqual([]);
    expect(response.body.products).toEqual([]);
  });

  it("sums each accepted product over today's orders, without rejected lines", async () => {
    const milk = await createProduct(store, { name: "Mlijeko", quantity: 50 });
    const bread = await createProduct(store, { name: "Hljeb", quantity: 50 });
    const first = await insertItem(milk.id, { quantity: 3 });
    await insertItem(milk.id, { quantity: 4 });
    // A rejected bread line on the first order is not packed.
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, restaurant_id, quantity, ordered_quantity, unit_price, status)
       VALUES ($1, $2, $3, 5, 5, 5, 'Rejected')`,
      [first.orderId, bread.id, await userId(RESTAURANT)],
    );
    await insertItem(bread.id, { quantity: 1 });

    const response = await store.get("/api/orders/packing");
    const totals = response.body.products.map(
      (row: { product_id: number; product_name: string; quantity: string; order_count: number }) => ({
        ...row,
        quantity: parseFloat(row.quantity),
      }),
    );
    expect(totals).toEqual([
      expect.objectContaining({ product_id: bread.id, product_name: "Hljeb", quantity: 1, order_count: 1 }),
      expect.objectContaining({ product_id: milk.id, product_name: "Mlijeko", quantity: 7, order_count: 2 }),
    ]);
    // The order still lists the rejected line, marked as such, for the store's own check.
    const order = response.body.orders.find((row: { id: number }) => row.id === first.orderId);
    expect(order.items.map((item: { status: string }) => item.status)).toEqual(["Confirmed", "Rejected"]);
  });

  it("is only for stores", async () => {
    const restaurant = await login(RESTAURANT);
    expect((await restaurant.get("/api/orders/packing")).status).toBe(403);
    expect((await request(app).get("/api/orders/packing")).status).toBe(401);
  });
});
