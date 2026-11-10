import {
  type Agent,
  cleanupUsers,
  createProduct,
  futureDate,
  futurePickup,
  productPayload,
  registerAndLogin,
  acceptItem,
  itemOrderAction,
  orderOf,
} from "./helpers.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com"];

let store: Agent;
let restaurant: Agent;

// Sends a one-item order at the test product's price (5 KM).
const send = (productId: number | string, quantity: unknown, pickup_at = futurePickup()) =>
  restaurant.post("/api/orders").send({ pickup_at, items: [{ product_id: productId, quantity, unit_price: 5 }] });

// The item of a sent one-item order.
const itemOf = (response: { body: { order: { items: { id: number }[] } } }) => response.body.order.items[0]!.id;

const orderDetails = async (itemId: number) =>
  (await restaurant.get(`/api/orders/${await orderOf(itemId)}`)).body.order;

const availableQuantity = async (productId: number) =>
  parseFloat((await store.get(`/api/products/${productId}`)).body.product.available_quantity);

describe("Order rules", () => {
  beforeEach(async () => {
    store = await registerAndLogin("store-a@test.com", "STORE");
    restaurant = await registerAndLogin("restaurant-a@test.com", "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  describe("POST /api/orders validation", () => {
    it.each([
      ["a negative quantity", -5],
      ["zero", 0],
      ["text", "abc"],
    ])("rejects %s and leaves the available quantity unchanged", async (_, quantity) => {
      const product = await createProduct(store);
      const response = await send(product.id, quantity);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Quantity must be greater than zero.");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it.each([
      ["in the past", `${futureDate(-1)}T10:00:00`],
      ["after the expiry date", `${futureDate(31)}T10:00:00`],
    ])("rejects a pickup date %s", async (_, pickupDate) => {
      const product = await createProduct(store);
      const response = await send(product.id, 2, pickupDate);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "Pickup date must be between today and the products' expiry date.",
      );
    });

    it("returns 404 for a non-numeric product id", async () => {
      const response = await send("abc", 2);
      expect(response.status).toBe(404);
    });
  });

  describe("accept and cancel", () => {
    it("lets only one of a simultaneous accept and cancel succeed", async () => {
      const product = await createProduct(store);
      const reservationId = itemOf(await send(product.id, 10));

      const [accept, cancel] = await Promise.all([
        acceptItem(store, reservationId),
        itemOrderAction(restaurant, reservationId, "cancel"),
      ]);
      expect([accept.status, cancel.status].sort()).toEqual([200, 400]);

      const reservation = await orderDetails(reservationId);
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

  describe("PUT /api/products/:id with orders", () => {
    it("keeps the ordered price after the store changes the product price", async () => {
      const product = await createProduct(store);
      const reservationId = itemOf(await send(product.id, 2));

      const update = await store
        .put(`/api/products/${product.id}`)
        .send(productPayload({ discounted_price: 8 }));
      expect(update.status).toBe(200);

      const order = await orderDetails(reservationId);
      expect(parseFloat(order.items[0].unit_price)).toBe(5);
    });

    it("keeps the quantity locked after publishing, also with orders", async () => {
      const product = await createProduct(store);
      await send(product.id, 6);

      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 6 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Quantity and expiry date cannot be changed after publishing.");
    });

    it("refuses to edit a product that is no longer available", async () => {
      const product = await createProduct(store);
      await acceptItem(store, itemOf(await send(product.id, 10)));

      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 20 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Only available products can be edited.");
    });
  });
});
