import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import { PICKUP_DATE, futureDate, productBody, registerAndLogin } from "./helpers.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com"];

let store;
let restaurant;

const createProduct = async (overrides = {}) => {
  const response = await store.post("/api/products").send(productBody(overrides));
  expect(response.status).toBe(201);
  return response.body.product.id;
};

const reserve = (productId, quantity, pickup_date = PICKUP_DATE) =>
  restaurant.post("/api/reservations").send({ product_id: productId, quantity, pickup_date });

const availableQuantity = async (productId) =>
  parseFloat((await store.get(`/api/products/${productId}`)).body.product.available_quantity);

describe("Reservation rules", () => {
  beforeEach(async () => {
    store = await registerAndLogin(request, app, "store-a@test.com", "STORE");
    restaurant = await registerAndLogin(request, app, "restaurant-a@test.com", "RESTAURANT");
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

  describe("POST /api/reservations validation", () => {
    it.each([
      ["a negative quantity", -5],
      ["zero", 0],
      ["text", "abc"],
    ])("rejects %s and leaves the available quantity unchanged", async (_, quantity) => {
      const productId = await createProduct();
      const response = await reserve(productId, quantity);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Količina mora biti broj veći od nule.");
      expect(await availableQuantity(productId)).toBe(10);
    });

    it("rejects an unparseable pickup date", async () => {
      const productId = await createProduct();
      const response = await reserve(productId, 2, "sutra");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Datum preuzimanja nije ispravan.");
    });

    it.each([
      ["in the past", `${futureDate(-1)}T10:00:00`],
      ["after the expiry date", `${futureDate(31)}T10:00:00`],
    ])("rejects a pickup date %s", async (_, pickupDate) => {
      const productId = await createProduct();
      const response = await reserve(productId, 2, pickupDate);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "Datum preuzimanja mora biti između danas i roka trajanja proizvoda.",
      );
    });

    it("returns 404 for a non-numeric product id", async () => {
      const response = await reserve("abc", 2);
      expect(response.status).toBe(404);
    });
  });

  describe("reject and cancel", () => {
    it("marks a rejected reservation as Rejected", async () => {
      const productId = await createProduct();
      const reservationId = (await reserve(productId, 2)).body.reservation.id;

      const response = await store.patch(`/api/reservations/${reservationId}/reject`);
      expect(response.status).toBe(200);

      const details = await restaurant.get(`/api/reservations/${reservationId}`);
      expect(details.body.reservation.status).toBe("Rejected");
    });

    it("lets only one of a simultaneous accept and cancel succeed", async () => {
      const productId = await createProduct();
      const reservationId = (await reserve(productId, 10)).body.reservation.id;

      const [accept, cancel] = await Promise.all([
        store.patch(`/api/reservations/${reservationId}/accept`),
        restaurant.patch(`/api/reservations/${reservationId}/cancel`),
      ]);
      expect([accept.status, cancel.status].sort()).toEqual([200, 400]);

      const reservation = (await restaurant.get(`/api/reservations/${reservationId}`)).body.reservation;
      const product = (await store.get(`/api/products/${productId}`)).body.product;
      if (accept.status === 200) {
        expect(reservation.status).toBe("Confirmed");
        expect(product.status).toBe("Sold");
      } else {
        expect(reservation.status).toBe("Cancelled");
        expect(product.status).toBe("Available");
      }
    });
  });

  describe("PUT /api/products/:id with reservations", () => {
    it("keeps the reserved price after the store changes the product price", async () => {
      const productId = await createProduct();
      const reservationId = (await reserve(productId, 2)).body.reservation.id;

      const update = await store
        .put(`/api/products/${productId}`)
        .send(productBody({ discounted_price: 8 }));
      expect(update.status).toBe(200);

      const reservation = (await restaurant.get(`/api/reservations/${reservationId}`)).body.reservation;
      expect(parseFloat(reservation.discounted_price)).toBe(5);
    });

    it("rejects a quantity below what is already reserved", async () => {
      const productId = await createProduct();
      await reserve(productId, 6);

      const response = await store.put(`/api/products/${productId}`).send(productBody({ quantity: 5 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Količina ne može biti manja od već rezervisane količine.");
    });

    it("marks the product Sold when the new quantity equals the confirmed quantity", async () => {
      const productId = await createProduct();
      const reservationId = (await reserve(productId, 6)).body.reservation.id;
      await store.patch(`/api/reservations/${reservationId}/accept`);

      const response = await store.put(`/api/products/${productId}`).send(productBody({ quantity: 6 }));
      expect(response.status).toBe(200);
      expect(response.body.product.status).toBe("Sold");
    });

    it("refuses to edit a product that is no longer available", async () => {
      const productId = await createProduct();
      const reservationId = (await reserve(productId, 10)).body.reservation.id;
      await store.patch(`/api/reservations/${reservationId}/accept`);

      const response = await store.put(`/api/products/${productId}`).send(productBody({ quantity: 20 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Samo dostupni proizvodi se mogu mijenjati.");
    });
  });

  describe("expiry job", () => {
    it("cancels Pending reservations but keeps Confirmed ones", async () => {
      const productId = await createProduct();
      const pendingId = (await reserve(productId, 2)).body.reservation.id;
      const confirmedId = (await reserve(productId, 3)).body.reservation.id;
      await store.patch(`/api/reservations/${confirmedId}/accept`);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [productId]);

      await expireProducts();

      const statuses = await pool.query("SELECT id, status FROM reservations WHERE id = ANY($1)", [
        [pendingId, confirmedId],
      ]);
      const byId = Object.fromEntries(statuses.rows.map((r) => [r.id, r.status]));
      expect(byId[pendingId]).toBe("Cancelled");
      expect(byId[confirmedId]).toBe("Confirmed");

      const notes = (await restaurant.get("/api/notifications")).body.notifications;
      const expiredNotes = notes.filter((n) => n.type === "RESERVATION_EXPIRED");
      expect(expiredNotes.map((n) => n.reservation_id)).toEqual([pendingId]);
    });
  });
});
