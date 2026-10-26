import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  futureDate,
  productPayload,
  registerAndLogin,
  reserve,
  type Agent,
  type Product,
} from "./helpers.js";

const STORE_A = "products-store-a@test.com";
const STORE_B = "products-store-b@test.com";
const RESTAURANT = "products-restaurant@test.com";

let store: Agent;

describe("Products routes", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  describe("POST /api/products", () => {
    it("creates a product owned by the store with status Available", async () => {
      const response = await store.post("/api/products").send(productPayload());
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Product created successfully.");
      expect(response.body.product).toMatchObject({ name: "Test Product", status: "Available" });
    });

    it("returns 400 when a required field is missing", async () => {
      const response = await store.post("/api/products").send(productPayload({ category: undefined }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("All fields are required.");
    });

    it("returns 400 for a negative price", async () => {
      const response = await store.post("/api/products").send(productPayload({ original_price: -10 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Prices and quantity must be positive numbers.");
    });

    it("returns 400 when the discounted price is above the original", async () => {
      const response = await store
        .post("/api/products")
        .send(productPayload({ original_price: 5, discounted_price: 8 }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Discounted price cannot be higher than the original price.");
    });
  });

  describe("PUT /api/products/:id", () => {
    it("updates an own product", async () => {
      const product = await createProduct(store);
      const response = await store
        .put(`/api/products/${product.id}`)
        .send(productPayload({ name: "Edited", discounted_price: 4, category: "Fish" }));
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Product updated successfully.");
      expect(response.body.product).toMatchObject({ name: "Edited", category: "Fish" });
      expect(parseFloat(response.body.product.discounted_price)).toBe(4);
    });

    it("returns 400 for invalid fields", async () => {
      const product = await createProduct(store);
      const response = await store.put(`/api/products/${product.id}`).send(productPayload({ name: "" }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("All fields are required.");
    });

    it("returns 403 for another store's product", async () => {
      const product = await createProduct(store);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const response = await storeB.put(`/api/products/${product.id}`).send(productPayload({ name: "Hacked" }));
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to edit this product.");
    });

    it("returns 404 for a product that does not exist", async () => {
      const response = await store.put("/api/products/999999").send(productPayload());
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Product not found.");
    });
  });

  describe("DELETE /api/products/:id", () => {
    it("soft-deletes an own product by setting status Removed", async () => {
      const product = await createProduct(store);
      const response = await store.delete(`/api/products/${product.id}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Product deleted successfully.");
      expect(response.body.product.status).toBe("Removed");
    });

    it("returns 403 for another store's product", async () => {
      const product = await createProduct(store);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const response = await storeB.delete(`/api/products/${product.id}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to delete this product.");
    });

    it("returns 404 for a product that does not exist", async () => {
      const response = await store.delete("/api/products/999999");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Product not found.");
    });

    it("returns 400 when the product has an active reservation", async () => {
      const product = await createProduct(store);
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      await reserve(restaurant, product.id, 1);

      const response = await store.delete(`/api/products/${product.id}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Product has active reservations and cannot be deleted.");
    });

    it.each(["Sold", "Expired", "Removed"])("returns 400 for a %s product", async (status) => {
      const product = await createProduct(store);
      await pool.query("UPDATE products SET status = $1 WHERE id = $2", [status, product.id]);

      const response = await store.delete(`/api/products/${product.id}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Product cannot be deleted because it is sold or expired.");
    });
  });

  describe("GET /api/products", () => {
    const listIds = async (query: Record<string, string | number> = {}) => {
      const response = await store.get("/api/products").query(query);
      expect(response.status).toBe(200);
      return (response.body.products as Product[]).map((p) => p.id);
    };

    it("lists available products with store details and available_quantity", async () => {
      const product = await createProduct(store);
      const response = await store.get("/api/products");
      const listed = response.body.products.find((p: Product) => p.id === product.id);
      expect(listed).toBeDefined();
      expect(listed.business_name).toBeDefined();
      expect(parseFloat(listed.available_quantity)).toBe(10);
    });

    it("hides products that are not Available or already expired", async () => {
      const removed = await createProduct(store);
      await store.delete(`/api/products/${removed.id}`);
      const expired = await createProduct(store);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [expired.id]);

      const ids = await listIds();
      expect(ids).not.toContain(removed.id);
      expect(ids).not.toContain(expired.id);
    });

    it("filters by category", async () => {
      const meat = await createProduct(store, { category: "Meat" });
      const dairy = await createProduct(store, { category: "Dairy" });
      const ids = await listIds({ category: "Dairy" });
      expect(ids).toContain(dairy.id);
      expect(ids).not.toContain(meat.id);
    });

    it("no longer filters by maxPrice", async () => {
      const cheap = await createProduct(store, { discounted_price: 2 });
      const pricey = await createProduct(store, { discounted_price: 9 });
      const ids = await listIds({ maxPrice: 5 });
      expect(ids).toContain(cheap.id);
      expect(ids).toContain(pricey.id);
    });

    it("filters by expiryWithinDays", async () => {
      const soon = await createProduct(store, { expiry_date: futureDate(1) });
      const later = await createProduct(store, { expiry_date: futureDate(20) });
      const ids = await listIds({ expiryWithinDays: 3 });
      expect(ids).toContain(soon.id);
      expect(ids).not.toContain(later.id);
    });

    it("filters by name, case-insensitively", async () => {
      const milk = await createProduct(store, { name: "Svježe Mlijeko XYZ" });
      const bread = await createProduct(store, { name: "Hljeb" });
      const ids = await listIds({ name: "mlijeko xyz" });
      expect(ids).toContain(milk.id);
      expect(ids).not.toContain(bread.id);
    });

    describe("city filter", () => {
      const setCity = (email: string, city: string) =>
        pool.query("UPDATE users SET city = $1 WHERE email = $2", [city, email]);

      let storeB: Agent;
      beforeEach(async () => {
        storeB = await registerAndLogin(STORE_B, "STORE");
        await setCity(STORE_A, "Zxcvgrad");
        await setCity(STORE_B, "Qwertyvil");
      });

      it("filters by the store's city, partially and case-insensitively", async () => {
        const inA = await createProduct(store);
        const inB = await createProduct(storeB);
        const ids = await listIds({ city: "XCVG" });
        expect(ids).toContain(inA.id);
        expect(ids).not.toContain(inB.id);
      });

      it("combines with the other filters, paging and total", async () => {
        const dairyA = await createProduct(store, { category: "Dairy" });
        await createProduct(store, { category: "Meat" });
        await createProduct(storeB, { category: "Dairy" });

        const filtered = await store.get("/api/products").query({ city: "zxcv", category: "Dairy" });
        expect(filtered.status).toBe(200);
        expect((filtered.body.products as Product[]).map((p) => p.id)).toEqual([dairyA.id]);
        expect(filtered.body.total).toBe(1);

        const paged = await store.get("/api/products").query({ city: "zxcv", limit: 1 });
        expect(paged.status).toBe(200);
        expect(paged.body.products).toHaveLength(1);
        expect(paged.body.total).toBe(2);
      });

      it("combines with a sort", async () => {
        const pricey = await createProduct(store, { name: "Grad sort", discounted_price: 9 });
        const cheap = await createProduct(store, { name: "Grad sort", discounted_price: 2 });
        await createProduct(storeB, { name: "Grad sort", discounted_price: 1 });

        const response = await store
          .get("/api/products")
          .query({ city: "zxcv", name: "grad sort", category: "Meat", expiryWithinDays: 30, sort: "price_asc" });
        expect(response.status).toBe(200);
        expect((response.body.products as Product[]).map((p) => p.id)).toEqual([cheap.id, pricey.id]);
        expect(response.body.total).toBe(2);
      });

      it("ignores an empty or blank city", async () => {
        const inA = await createProduct(store);
        const inB = await createProduct(storeB);
        for (const city of ["", "   "]) {
          const ids = await listIds({ city });
          expect(ids).toContain(inA.id);
          expect(ids).toContain(inB.id);
        }
      });
    });

    describe("sort", () => {
      const NAME = "Sortiranje XQ";
      const sortedIds = (sort: string, query: Record<string, string | number> = {}) =>
        listIds({ name: NAME, sort, ...query });

      it.each([
        ["price_asc", ["b", "c", "a"]],
        ["price_desc", ["a", "c", "b"]],
        ["discount_desc", ["b", "c", "a"]],
        ["discount_asc", ["a", "c", "b"]],
      ])("orders by %s", async (sort, order) => {
        // a: 8 (20% off), b: 2 (80% off), c: 5 (75% off)
        const products = {
          a: await createProduct(store, { name: NAME, original_price: 10, discounted_price: 8 }),
          b: await createProduct(store, { name: NAME, original_price: 10, discounted_price: 2 }),
          c: await createProduct(store, { name: NAME, original_price: 20, discounted_price: 5 }),
        };
        expect(await sortedIds(sort)).toEqual(order.map((key) => products[key as keyof typeof products].id));
      });

      it("breaks ties by id across pages", async () => {
        // The same discount from different prices (5/10 = 10/20).
        const ids: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const product = await createProduct(store, {
            name: NAME,
            original_price: i % 2 ? 10 : 20,
            discounted_price: i % 2 ? 5 : 10,
          });
          ids.push(product.id);
        }
        const expected = [...ids].sort((x, y) => y - x);
        const pagedIds = async (sort: string) => {
          const paged: number[] = [];
          for (let offset = 0; offset < 5; offset += 2) {
            paged.push(...(await sortedIds(sort, { limit: 2, offset })));
          }
          return paged;
        };

        expect(await pagedIds("discount_desc")).toEqual(expected);
        expect(await pagedIds("discount_asc")).toEqual(expected);

        // Then the same price everywhere.
        await pool.query("UPDATE products SET original_price = 10, discounted_price = 5 WHERE id = ANY($1)", [ids]);
        expect(await pagedIds("price_asc")).toEqual(expected);
        expect(await pagedIds("price_desc")).toEqual(expected);
      });

      it("keeps newest as the default", async () => {
        const first = await createProduct(store, { name: NAME });
        const second = await createProduct(store, { name: NAME });
        await pool.query("UPDATE products SET created_at = created_at - INTERVAL '1 hour' WHERE id = $1", [first.id]);
        expect(await listIds({ name: NAME })).toEqual([second.id, first.id]);
        expect(await sortedIds("newest")).toEqual([second.id, first.id]);
      });
    });
  });

  describe("GET /api/products/mine", () => {
    const mineIds = async (query: Record<string, string | number> = {}) => {
      const response = await store.get("/api/products/mine").query(query);
      expect(response.status).toBe(200);
      return (response.body.products as Product[]).map((p) => p.id);
    };

    it("returns only the calling store's products and hides Removed ones", async () => {
      const own = await createProduct(store);
      const removed = await createProduct(store);
      await store.delete(`/api/products/${removed.id}`);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const foreign = await createProduct(storeB);

      expect(await mineIds()).toEqual([own.id]);
      expect(await mineIds()).not.toContain(foreign.id);
    });

    it("filters by status, category, name and expiryWithinDays", async () => {
      const sold = await createProduct(store, { name: "Sir", category: "Dairy", expiry_date: futureDate(2) });
      await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [sold.id]);
      const meat = await createProduct(store, { name: "Piletina", category: "Meat", expiry_date: futureDate(15) });

      expect(await mineIds({ status: "Sold" })).toEqual([sold.id]);
      expect(await mineIds({ category: "Meat" })).toEqual([meat.id]);
      expect(await mineIds({ name: "pile" })).toEqual([meat.id]);
      expect(await mineIds({ expiryWithinDays: 5 })).toEqual([sold.id]);
    });

    it("sorts by expiry and price within each status group", async () => {
      const late = await createProduct(store, { discounted_price: 3, expiry_date: futureDate(20) });
      const soon = await createProduct(store, { discounted_price: 8, expiry_date: futureDate(2) });
      const mid = await createProduct(store, { discounted_price: 5, expiry_date: futureDate(10) });
      // Sold, cheapest and soonest, but still after every Available product.
      const sold = await createProduct(store, { discounted_price: 1, expiry_date: futureDate(1) });
      await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [sold.id]);

      expect(await mineIds({ sort: "expiry" })).toEqual([soon.id, mid.id, late.id, sold.id]);
      expect(await mineIds({ sort: "price_asc" })).toEqual([late.id, mid.id, soon.id, sold.id]);
      expect(await mineIds({ sort: "price_desc" })).toEqual([soon.id, mid.id, late.id, sold.id]);
      expect(await mineIds()).toEqual([mid.id, soon.id, late.id, sold.id]);
      expect(await mineIds({ sort: "newest" })).toEqual([mid.id, soon.id, late.id, sold.id]);
    });

    it("returns 403 for a RESTAURANT", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.get("/api/products/mine");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/products/:id", () => {
    it("returns details including available_quantity", async () => {
      const product = await createProduct(store);
      const response = await store.get(`/api/products/${product.id}`);
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.product.available_quantity)).toBe(parseFloat(product.quantity));
      expect(response.body.product.days_until_expiry).toBe(30);
    });

    it("returns 404 for a product that does not exist", async () => {
      const response = await store.get("/api/products/999999");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Product not found.");
    });

    it("returns the store contact details", async () => {
      const profile = await store.put("/api/users/me").send({
        first_name: "Test",
        last_name: "Korisnik",
        business_name: "Prodavnica Test",
        city: "Sarajevo",
        phone: "033123456",
        address: "Titova 1",
        pickup_hours: "08-16",
      });
      expect(profile.status).toBe(200);

      const product = await createProduct(store);
      const response = await store.get(`/api/products/${product.id}`);
      expect(response.status).toBe(200);
      expect(response.body.product).toMatchObject({
        business_name: "Prodavnica Test",
        store_phone: "033123456",
        store_address: "Titova 1",
        store_pickup_hours: "08-16",
      });
    });
  });
});
