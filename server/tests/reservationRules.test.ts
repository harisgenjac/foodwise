import {
  type Agent,
  cleanupUsers,
  createProduct,
  futureDate,
  futurePickup,
  productPayload,
  registerAndLogin,
} from "./helpers.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com"];

let store: Agent;
let restaurant: Agent;

const reserve = (productId: number | string, quantity: unknown, pickup_date = futurePickup()) =>
  restaurant.post("/api/reservations").send({ product_id: productId, quantity, pickup_date });

const availableQuantity = async (productId: number) =>
  parseFloat((await store.get(`/api/products/${productId}`)).body.product.available_quantity);

describe("Reservation rules", () => {
  beforeEach(async () => {
    store = await registerAndLogin("store-a@test.com", "STORE");
    restaurant = await registerAndLogin("restaurant-a@test.com", "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  describe("POST /api/reservations validation", () => {
    it.each([
      ["a negative quantity", -5],
      ["zero", 0],
      ["text", "abc"],
    ])("rejects %s and leaves the available quantity unchanged", async (_, quantity) => {
      const product = await createProduct(store);
      const response = await reserve(product.id, quantity);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Količina mora biti veća od nule.");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it.each([
      ["in the past", `${futureDate(-1)}T10:00:00`],
      ["after the expiry date", `${futureDate(31)}T10:00:00`],
    ])("rejects a pickup date %s", async (_, pickupDate) => {
      const product = await createProduct(store);
      const response = await reserve(product.id, 2, pickupDate);
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
    it("lets only one of a simultaneous accept and cancel succeed", async () => {
      const product = await createProduct(store);
      const reservationId = (await reserve(product.id, 10)).body.reservation.id;

      const [accept, cancel] = await Promise.all([
        store.patch(`/api/reservations/${reservationId}/accept`),
        restaurant.patch(`/api/reservations/${reservationId}/cancel`),
      ]);
      expect([accept.status, cancel.status].sort()).toEqual([200, 400]);

      const reservation = (await restaurant.get(`/api/reservations/${reservationId}`)).body.reservation;
      const current = (await store.get(`/api/products/${product.id}`)).body.product;
      if (accept.status === 200) {
        expect(reservation.status).toBe("Confirmed");
        expect(current.status).toBe("Sold");
      } else {
        expect(reservation.status).toBe("Cancelled");
        expect(current.status).toBe("Available");
      }
    });
  });

  describe("PUT /api/products/:id with reservations", () => {
    it("keeps the reserved price after the store changes the product price", async () => {
      const product = await createProduct(store);
      const reservationId = (await reserve(product.id, 2)).body.reservation.id;

      const update = await store
        .put(`/api/products/${product.id}`)
        .send(productPayload({ discounted_price: 8 }));
      expect(update.status).toBe(200);

      const reservation = (await restaurant.get(`/api/reservations/${reservationId}`)).body.reservation;
      expect(parseFloat(reservation.discounted_price)).toBe(5);
    });

    it("rejects a quantity below what is already reserved", async () => {
      const product = await createProduct(store);
      await reserve(product.id, 6);

      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 5 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Količina ne može biti manja od već rezervisane količine.");
    });

    it("marks the product Sold when the new quantity equals the confirmed quantity", async () => {
      const product = await createProduct(store);
      const reservationId = (await reserve(product.id, 6)).body.reservation.id;
      await store.patch(`/api/reservations/${reservationId}/accept`);

      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 6 }));
      expect(response.status).toBe(200);
      expect(response.body.product.status).toBe("Sold");
    });

    it("refuses to edit a product that is no longer available", async () => {
      const product = await createProduct(store);
      const reservationId = (await reserve(product.id, 10)).body.reservation.id;
      await store.patch(`/api/reservations/${reservationId}/accept`);

      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 20 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Samo dostupni proizvodi se mogu mijenjati.");
    });
  });
});
