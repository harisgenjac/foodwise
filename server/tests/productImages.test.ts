import fs from "fs";
import path from "path";
import pool from "../src/config/db.js";
import { UPLOADS_DIR } from "../src/services/storage.js";
import { removeUnusedProductImages, UNUSED_UPLOAD_AGE_MS } from "../src/jobs/cleanupUploads.js";
import { cleanupUsers, createProduct, productPayload, registerAndLogin, type Agent } from "./helpers.js";

const STORE_A = "images-store-a@test.com";
const STORE_B = "images-store-b@test.com";
const RESTAURANT = "images-restaurant@test.com";
// The server checks the declared type, not the pixels.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const filePath = (url: string) => path.join(UPLOADS_DIR, "products", path.basename(url));
const exists = (url: string) => fs.existsSync(filePath(url));

let storeA: Agent;
let uploaded: string[] = [];

const upload = async (agent: Agent) => {
  const response = await agent
    .post("/api/products/images")
    .attach("image", PNG_BYTES, { filename: "photo.png", contentType: "image/png" });
  expect(response.status).toBe(201);
  uploaded.push(response.body.image_url);
  return response.body.image_url as string;
};

const templatePayload = (overrides: Record<string, unknown> = {}) => ({
  name: "Slika šablon",
  category: "Dairy",
  unit: "kom",
  ...overrides,
});

describe("Product images", () => {
  beforeEach(async () => {
    storeA = await registerAndLogin(STORE_A, "STORE");
    uploaded = [];
  });

  afterEach(async () => {
    for (const url of uploaded) fs.rmSync(filePath(url), { force: true });
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  describe("POST /api/products/images", () => {
    it("stores the image under the store's name with the extension of its type", async () => {
      const response = await storeA
        .post("/api/products/images")
        .attach("image", PNG_BYTES, { filename: "evil.html", contentType: "image/png" });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Image uploaded successfully.");
      uploaded.push(response.body.image_url);
      const storeId = (await pool.query("SELECT id FROM users WHERE email = $1", [STORE_A])).rows[0].id;
      expect(response.body.image_url).toMatch(new RegExp(`^/uploads/products/${storeId}-\\d+-[0-9a-f]+\\.png$`));
      expect(exists(response.body.image_url)).toBe(true);
    });

    it("rejects other file types", async () => {
      const response = await storeA
        .post("/api/products/images")
        .attach("image", Buffer.from("GIF89a"), { filename: "a.gif", contentType: "image/gif" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Only JPEG, PNG and WEBP images are allowed.");
    });

    it("rejects a file over 5MB", async () => {
      const response = await storeA
        .post("/api/products/images")
        .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), { filename: "big.png", contentType: "image/png" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("The image can be at most 5MB.");
    });

    it("needs a file", async () => {
      const response = await storeA.post("/api/products/images");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No image was uploaded.");
    });

    it("is only for stores", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant
        .post("/api/products/images")
        .attach("image", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
      expect(response.status).toBe(403);
    });
  });

  describe("a product's image", () => {
    it("is empty by default and never follows the category", async () => {
      const product = await createProduct(storeA, { category: "Fish" });
      expect(product).toMatchObject({ image_url: null });
    });

    it("can be a suggested image", async () => {
      const product = await createProduct(storeA, { image_url: "suggested:bakery" });
      expect(product).toMatchObject({ image_url: "suggested:bakery" });
    });

    it("can be the store's own upload", async () => {
      const url = await upload(storeA);
      const product = await createProduct(storeA, { image_url: url });
      expect(product).toMatchObject({ image_url: url });
    });

    it.each([
      ["an unknown suggested key", "suggested:cake"],
      ["an outside URL", "https://example.com/a.png"],
      ["a logo", "/uploads/logos/1-1.png"],
      ["a path leaving the folder", "/uploads/products/../logos/a.png"],
      ["a missing upload", "/uploads/products/999999-1-ab.png"],
    ])("rejects %s", async (_label, value) => {
      const response = await storeA.post("/api/products").send(productPayload({ image_url: value }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Image is not valid.");
    });

    it("rejects another store's upload", async () => {
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const url = await upload(storeB);
      const response = await storeA.post("/api/products").send(productPayload({ image_url: url }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Image is not valid.");
    });

    it("stays editable after publishing and deletes the replaced upload", async () => {
      const first = await upload(storeA);
      const product = await createProduct(storeA, { image_url: first });
      const second = await upload(storeA);

      const response = await storeA.put(`/api/products/${product.id}`).send(productPayload({ image_url: second }));
      expect(response.status).toBe(200);
      expect(response.body.product.image_url).toBe(second);
      expect(exists(first)).toBe(false);
      expect(exists(second)).toBe(true);
    });

    it("is removed with null, which deletes the upload", async () => {
      const url = await upload(storeA);
      const product = await createProduct(storeA, { image_url: url });
      const response = await storeA.put(`/api/products/${product.id}`).send(productPayload({ image_url: null }));
      expect(response.body.product.image_url).toBeNull();
      expect(exists(url)).toBe(false);
    });

    it("stays as it is when an edit does not send it", async () => {
      const product = await createProduct(storeA, { image_url: "suggested:meat" });
      const response = await storeA.put(`/api/products/${product.id}`).send(productPayload({ name: "Novo ime" }));
      expect(response.body.product.image_url).toBe("suggested:meat");
    });

    it("is listed in the marketplace and the cart", async () => {
      const product = await createProduct(storeA, { image_url: "suggested:fruits" });
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const listed = await restaurant.get("/api/products").query({ store_id: product.store_id });
      expect(listed.body.products[0].image_url).toBe("suggested:fruits");

      await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 1 });
      const cart = await restaurant.get("/api/cart");
      expect(cart.body.cart.items[0].image_url).toBe("suggested:fruits");
    });
  });

  describe("templates", () => {
    it("remember the image", async () => {
      const response = await storeA.post("/api/product-templates").send(templatePayload({ image_url: "suggested:dairy" }));
      expect(response.status).toBe(201);
      expect(response.body.template.image_url).toBe("suggested:dairy");
    });

    it("reject an invalid image", async () => {
      const response = await storeA.post("/api/product-templates").send(templatePayload({ image_url: "suggested:x" }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Image is not valid.");
    });

    it("keep an upload a product no longer uses, and delete it with the template", async () => {
      const url = await upload(storeA);
      const product = await createProduct(storeA, { image_url: url });
      const saved = await storeA.post("/api/product-templates").send(templatePayload({ image_url: url }));

      await storeA.put(`/api/products/${product.id}`).send(productPayload({ image_url: "suggested:other" }));
      expect(exists(url)).toBe(true);

      await storeA.delete(`/api/product-templates/${saved.body.template.id}`);
      expect(exists(url)).toBe(false);
    });

    it("delete the replaced upload when saved again under the same name", async () => {
      const url = await upload(storeA);
      await storeA.post("/api/product-templates").send(templatePayload({ image_url: url }));
      await storeA.post("/api/product-templates").send(templatePayload({ image_url: "suggested:dairy" }));
      expect(exists(url)).toBe(false);
    });
  });

  describe("the daily cleanup", () => {
    it("deletes old uploads nothing uses and keeps the rest", async () => {
      const unused = await upload(storeA);
      const used = await upload(storeA);
      await createProduct(storeA, { image_url: used });
      const fresh = await upload(storeA);
      const old = new Date(Date.now() - UNUSED_UPLOAD_AGE_MS - 60_000);
      fs.utimesSync(filePath(unused), old, old);
      fs.utimesSync(filePath(used), old, old);

      await removeUnusedProductImages();

      expect(exists(unused)).toBe(false);
      expect(exists(used)).toBe(true);
      expect(exists(fresh)).toBe(true);
    });
  });
});
