import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import { sendReminders } from "../src/jobs/notificationReminders.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com", "restaurant-b@test.com"];

const registerAndLogin = async (email, role) => {
  await request(app).post("/api/auth/register").send({
    first_name: "Test",
    last_name: "User",
    email,
    password: "test12345",
    role,
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "test12345" });
  return agent;
};

const userId = async (email) =>
  (await pool.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;

let store;
let restaurant;
let otherRestaurant;

const createProduct = async (quantity = 10) => {
  const response = await store.post("/api/products").send({
    name: "Piletina",
    description: "Test description",
    category: "Meat",
    original_price: 10,
    discounted_price: 5,
    quantity,
    unit: "kg",
    expiry_date: "2030-12-31",
  });
  return response.body.product.id;
};

const reserve = async (productId, quantity) => {
  const response = await restaurant.post("/api/reservations").send({
    product_id: productId,
    quantity,
    pickup_date: "2030-12-30T10:00:00.000Z",
  });
  return response.body.reservation.id;
};

describe("Notifications routes", () => {
  beforeEach(async () => {
    store = await registerAndLogin("store-a@test.com", "STORE");
    restaurant = await registerAndLogin("restaurant-a@test.com", "RESTAURANT");
    otherRestaurant = await registerAndLogin("restaurant-b@test.com", "RESTAURANT");
  });

  afterEach(async () => {
    await pool.query(
      "DELETE FROM reservations WHERE restaurant_id IN (SELECT id FROM users WHERE email = ANY($1))",
      [EMAILS],
    );
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [EMAILS]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("notifies the store about a new reservation with links and product details", async () => {
    const productId = await createProduct();
    const reservationId = await reserve(productId, 4);

    const response = await store.get("/api/notifications");
    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBe(1);
    const [notification] = response.body.notifications;
    expect(notification.type).toBe("RESERVATION_CREATED");
    expect(notification.reservation_id).toBe(reservationId);
    expect(notification.product_id).toBe(productId);
    expect(notification.product_name).toBe("Piletina");
    expect(notification.unit).toBe("kg");
    expect(parseFloat(notification.quantity)).toBe(4);
  });

  it("notifies the restaurant on accept and the store when the product sells out", async () => {
    const productId = await createProduct(4);
    const reservationId = await reserve(productId, 4);

    const accept = await store.patch(`/api/reservations/${reservationId}/accept`);
    expect(accept.status).toBe(200);

    const restaurantList = await restaurant.get("/api/notifications");
    expect(restaurantList.body.notifications[0].type).toBe("RESERVATION_ACCEPTED");
    expect(restaurantList.body.notifications[0].reservation_id).toBe(reservationId);

    const storeTypes = (await store.get("/api/notifications")).body.notifications.map((n) => n.type);
    expect(storeTypes).toEqual(expect.arrayContaining(["RESERVATION_CREATED", "PRODUCT_SOLD_OUT"]));
  });

  it("notifies the restaurant on reject and the store on cancel", async () => {
    const productId = await createProduct();
    const rejected = await reserve(productId, 2);
    const cancelled = await reserve(productId, 2);

    await store.patch(`/api/reservations/${rejected}/reject`);
    await restaurant.patch(`/api/reservations/${cancelled}/cancel`);

    const restaurantList = (await restaurant.get("/api/notifications")).body.notifications;
    expect(restaurantList[0]).toMatchObject({ type: "RESERVATION_REJECTED", reservation_id: rejected });

    const storeList = (await store.get("/api/notifications")).body.notifications;
    expect(storeList[0]).toMatchObject({ type: "RESERVATION_CANCELLED", reservation_id: cancelled });
  });

  it("marks one and then all notifications as read", async () => {
    const productId = await createProduct();
    await reserve(productId, 1);
    await reserve(productId, 1);

    const [first] = (await store.get("/api/notifications")).body.notifications;
    const one = await store.patch(`/api/notifications/${first.id}/read`);
    expect(one.status).toBe(200);
    expect((await store.get("/api/notifications")).body.unreadCount).toBe(1);

    const all = await store.patch("/api/notifications/read-all");
    expect(all.status).toBe(200);
    expect(all.body.message).toBe("Sve notifikacije su označene kao pročitane.");
    expect((await store.get("/api/notifications")).body.unreadCount).toBe(0);
  });

  it("deletes a single notification and then all read ones", async () => {
    const productId = await createProduct();
    await reserve(productId, 1);
    await reserve(productId, 1);
    await reserve(productId, 1);

    const list = (await store.get("/api/notifications")).body.notifications;
    const removed = await store.delete(`/api/notifications/${list[0].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe("Notifikacija je obrisana.");

    await store.patch(`/api/notifications/${list[1].id}/read`);
    const cleared = await store.delete("/api/notifications/read");
    expect(cleared.status).toBe(200);
    expect(cleared.body.deleted).toBe(1);

    const remaining = (await store.get("/api/notifications")).body.notifications;
    expect(remaining.map((n) => n.id)).toEqual([list[2].id]);
  });

  it("returns 404 when reading or deleting another user's notification", async () => {
    const productId = await createProduct();
    await reserve(productId, 1);
    const [notification] = (await store.get("/api/notifications")).body.notifications;

    const read = await otherRestaurant.patch(`/api/notifications/${notification.id}/read`);
    expect(read.status).toBe(404);
    expect(read.body.error).toBe("Notifikacija nije pronađena.");

    const removed = await otherRestaurant.delete(`/api/notifications/${notification.id}`);
    expect(removed.status).toBe(404);

    expect((await store.get("/api/notifications")).body.unreadCount).toBe(1);
  });

  it("notifies the store and the restaurant when the expiry job runs", async () => {
    const storeId = await userId("store-a@test.com");
    const restaurantId = await userId("restaurant-a@test.com");
    const product = await pool.query(
      `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
       VALUES ($1, 'Jogurt', 'Dairy', 2, 1, 10, 'kom', CURRENT_DATE - 1) RETURNING id`,
      [storeId],
    );
    const productId = product.rows[0].id;
    const reservation = await pool.query(
      `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
       VALUES ($1, $2, 2, 1, 'Pending', NOW()) RETURNING id`,
      [productId, restaurantId],
    );

    await expireProducts();

    const storeList = (await store.get("/api/notifications")).body.notifications;
    expect(storeList[0]).toMatchObject({ type: "PRODUCT_EXPIRED", product_id: productId });

    const restaurantList = (await restaurant.get("/api/notifications")).body.notifications;
    expect(restaurantList[0]).toMatchObject({
      type: "RESERVATION_EXPIRED",
      reservation_id: reservation.rows[0].id,
    });
  });

  it("sends each reminder once", async () => {
    const storeId = await userId("store-a@test.com");
    const restaurantId = await userId("restaurant-a@test.com");
    const expiring = await pool.query(
      `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
       VALUES ($1, 'Hljeb', 'Bakery', 2, 1, 10, 'kom', CURRENT_DATE + 1) RETURNING id`,
      [storeId],
    );
    await pool.query(
      `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
       VALUES ($1, $2, 2, 1, 'Pending', NOW() + interval '1 day')`,
      [expiring.rows[0].id, restaurantId],
    );
    const pickup = await pool.query(
      `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
       VALUES ($1, 'Sir', 'Dairy', 2, 1, 10, 'kg', CURRENT_DATE + 5) RETURNING id`,
      [storeId],
    );
    const confirmed = await pool.query(
      `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
       VALUES ($1, $2, 2, 1, 'Confirmed', CURRENT_DATE + interval '12 hours') RETURNING id`,
      [pickup.rows[0].id, restaurantId],
    );

    await sendReminders();
    await sendReminders();

    const storeList = (await store.get("/api/notifications")).body.notifications;
    const expiringNotes = storeList.filter((n) => n.type === "PRODUCT_EXPIRING_SOON");
    expect(expiringNotes).toHaveLength(1);
    expect(expiringNotes[0].product_id).toBe(expiring.rows[0].id);

    const restaurantList = (await restaurant.get("/api/notifications")).body.notifications;
    const pickupNotes = restaurantList.filter((n) => n.type === "PICKUP_TODAY");
    expect(pickupNotes).toHaveLength(1);
    expect(pickupNotes[0].reservation_id).toBe(confirmed.rows[0].id);
  });
});
