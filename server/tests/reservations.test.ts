import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  futurePickup,
  registerAndLogin,
  reserve,
  type Agent,
} from "./helpers.js";

const STORE_A = "reservations-store-a@test.com";
const STORE_B = "reservations-store-b@test.com";
const RESTAURANT_A = "reservations-restaurant-a@test.com";
const RESTAURANT_B = "reservations-restaurant-b@test.com";

let store: Agent;
let restaurant: Agent;

const availableQuantity = async (productId: number) => {
  const response = await store.get(`/api/products/${productId}`);
  return parseFloat(response.body.product.available_quantity);
};

const reservationStatus = async (id: number) =>
  (await pool.query<{ status: string }>("SELECT status FROM reservations WHERE id = $1", [id])).rows[0]!.status;

describe("Reservations routes", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("POST /api/reservations", () => {
    it("creates a Pending reservation and reduces available_quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 4, pickup_date: futurePickup() });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Reservation created successfully.");
      expect(response.body.reservation.status).toBe("Pending");
      expect(await availableQuantity(product.id)).toBe(6);
    });

    it("returns 400 when a field is missing", async () => {
      const product = await createProduct(store);
      const response = await restaurant.post("/api/reservations").send({ product_id: product.id, quantity: 1 });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("All fields are required.");
    });

    it.each([-5, "abc"])("returns 400 for quantity %s", async (quantity) => {
      const product = await createProduct(store);
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Quantity must be greater than zero.");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 400 for an invalid pickup date", async () => {
      const product = await createProduct(store);
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: "sutra" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pickup date is not valid.");
    });

    it("returns 400 when the quantity exceeds what is available", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 15, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Not enough product available.");
    });

    it("returns 404 for a product that does not exist", async () => {
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: 999999, quantity: 5, pickup_date: futurePickup() });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Product not found.");
    });

    it.each([
      ["has expired", "UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1"],
      ["is sold", "UPDATE products SET status = 'Sold' WHERE id = $1"],
      ["is removed", "UPDATE products SET status = 'Removed' WHERE id = $1"],
    ])("returns 400 when the product %s", async (_case, updateSql) => {
      const product = await createProduct(store);
      await pool.query(updateSql, [product.id]);

      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 2, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Product is no longer available for reservation.");
    });

    it("returns 403 for a STORE", async () => {
      const response = await store
        .post("/api/reservations")
        .send({ product_id: 999999, quantity: 5, pickup_date: futurePickup() });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You do not have the required role for this action.");
    });

    it("lets several restaurants reserve parts of the same product", async () => {
      const product = await createProduct(store, { quantity: 20 });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurant, product.id, 10);
      await reserve(restaurantB, product.id, 10);
      expect(await availableQuantity(product.id)).toBe(0);
    });

    it("prevents overselling when two reservations arrive at the same time", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      const body = { product_id: product.id, quantity: 8, pickup_date: futurePickup() };

      const [a, b] = await Promise.all([
        restaurant.post("/api/reservations").send(body),
        restaurantB.post("/api/reservations").send(body),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      expect(await availableQuantity(product.id)).toBe(2);
    });
  });

  describe("GET /api/reservations/mine", () => {
    it("returns only the restaurant's own reservations with product and store info", async () => {
      const product = await createProduct(store, { name: "Piletina" });
      const own = await reserve(restaurant, product.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurantB, product.id, 1);

      const response = await restaurant.get("/api/reservations/mine");
      expect(response.status).toBe(200);
      expect(response.body.reservations).toHaveLength(1);
      expect(response.body.reservations[0]).toMatchObject({ id: own, product_name: "Piletina", unit: "kg" });
    });

    it("filters by status and product name", async () => {
      const chicken = await createProduct(store, { name: "Piletina" });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const pending = await reserve(restaurant, chicken.id, 1);
      const cancelled = await reserve(restaurant, milk.id, 1);
      await restaurant.patch(`/api/reservations/${cancelled}/cancel`);

      const byStatus = await restaurant.get("/api/reservations/mine").query({ status: "Cancelled" });
      expect(byStatus.body.reservations.map((r: { id: number }) => r.id)).toEqual([cancelled]);

      const byName = await restaurant.get("/api/reservations/mine").query({ name: "pilet" });
      expect(byName.body.reservations.map((r: { id: number }) => r.id)).toEqual([pending]);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/reservations/mine");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/reservations/store", () => {
    it("returns reservations for the store's products only, Pending first", async () => {
      const product = await createProduct(store);
      const first = await reserve(restaurant, product.id, 1);
      const second = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${first}/accept`);

      const storeB = await registerAndLogin(STORE_B, "STORE");
      const foreign = await createProduct(storeB);
      await reserve(restaurant, foreign.id, 1);

      const response = await store.get("/api/reservations/store");
      expect(response.status).toBe(200);
      expect(response.body.reservations.map((r: { id: number }) => r.id)).toEqual([second, first]);
    });

    it("filters by status", async () => {
      const product = await createProduct(store);
      const accepted = await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${accepted}/accept`);

      const response = await store.get("/api/reservations/store").query({ status: "Confirmed" });
      expect(response.body.reservations.map((r: { id: number }) => r.id)).toEqual([accepted]);
    });

    it("returns 403 for a RESTAURANT", async () => {
      const response = await restaurant.get("/api/reservations/store");
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/reservations/:id/accept", () => {
    it("confirms a Pending reservation", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation accepted successfully.");
      expect(await reservationStatus(id)).toBe("Confirmed");
    });

    it("marks the product Sold once confirmed reservations cover the quantity", async () => {
      const product = await createProduct(store, { quantity: 4 });
      const id = await reserve(restaurant, product.id, 4);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.get(`/api/products/${product.id}`);
      expect(response.body.product.status).toBe("Sold");
    });

    it("returns 403 for another store", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to accept this reservation.");
      expect(await reservationStatus(id)).toBe("Pending");
    });

    it("returns 403 for a RESTAURANT", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const response = await restaurant.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(403);
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await store.patch("/api/reservations/999999/accept");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Reservation not found.");
    });

    it("returns 400 when the reservation is not Pending", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });

    it("returns 400 when the product has expired", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "The reservation cannot be accepted because the product has expired.",
      );
    });
  });

  describe("PATCH /api/reservations/:id/reject", () => {
    it("rejects a Pending reservation and frees the quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await reserve(restaurant, product.id, 4);

      const response = await store.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation rejected successfully.");
      expect(await reservationStatus(id)).toBe("Rejected");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 403 for another store", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to reject this reservation.");
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await store.patch("/api/reservations/999999/reject");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Reservation not found.");
    });

    it("returns 400 when the reservation is not Pending", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });
  });

  describe("PATCH /api/reservations/:id/cancel", () => {
    it("cancels the restaurant's own Pending reservation and frees the quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await reserve(restaurant, product.id, 3);

      const response = await restaurant.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation cancelled successfully.");
      expect(await reservationStatus(id)).toBe("Cancelled");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 403 for another restaurant", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurantB.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to cancel this reservation.");
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await restaurant.patch("/api/reservations/999999/cancel");
      expect(response.status).toBe(404);
    });

    it("returns 400 when the reservation is already confirmed", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await restaurant.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });
  });

  describe("GET /api/reservations/:id", () => {
    it("returns the store and restaurant details to the store", async () => {
      const product = await createProduct(store);
      const profile = await restaurant.put("/api/users/me").send({
        first_name: "Restaurant",
        last_name: "A",
        business_name: "Restoran Test",
        city: "Sarajevo",
        phone: "061111222",
        address: "Ulica 1",
      });
      expect(profile.status).toBe(200);
      const id = await reserve(restaurant, product.id, 2);

      const response = await store.get(`/api/reservations/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.reservation).toMatchObject({
        product_id: product.id,
        store_id: product.store_id,
        restaurant_name: "Restoran Test",
        restaurant_city: "Sarajevo",
        restaurant_phone: "061111222",
        restaurant_address: "Ulica 1",
      });
    });

    it("returns the reservation to the restaurant that made it", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const response = await restaurant.get(`/api/reservations/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.reservation.id).toBe(id);
    });

    it("returns 404 to a restaurant that did not make the reservation", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurantB.get(`/api/reservations/${id}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("No reservation exists with that ID");
    });

    it("returns 404 to a store that does not own the product", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.get(`/api/reservations/${id}`);
      expect(response.status).toBe(404);
    });
  });
});
