import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import {
  cleanupUsers,
  createDonation,
  createProduct,
  donationPayload,
  futureDate,
  registerAndLogin,
  reserve,
  type Agent,
} from "./helpers.js";

const STORE_A = "donations-store-a@test.com";
const STORE_B = "donations-store-b@test.com";
const RESTAURANT = "donations-restaurant@test.com";

const MEAL = {
  donation_type: "SPONSORED",
  name: "Grah",
  category: "Meals",
  quantity: 12,
  unit: "portion",
  original_price: 8,
  donation_price: 4,
  pickup_from: "19:00",
  pickup_until: "21:00",
  allergens: ["celery", "gluten"],
  serving_temperature: "HOT",
};

describe("Donations routes", () => {
  let storeA: Agent;
  let restaurant: Agent;

  beforeEach(async () => {
    storeA = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  describe("create", () => {
    it("creates a free donation for a store without a price", async () => {
      const response = await storeA
        .post("/api/donations")
        .send(donationPayload({ donation_price: 1 }));
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Donacija uspješno objavljena.");
      expect(response.body.donation).toMatchObject({
        donation_type: "FREE",
        donation_price: null,
        status: "Available",
        allergens: [],
      });
    });

    it("creates a sponsored meal for a restaurant with meal details", async () => {
      const response = await restaurant.post("/api/donations").send(donationPayload(MEAL));
      expect(response.status).toBe(201);
      expect(response.body.donation).toMatchObject({
        donation_type: "SPONSORED",
        donation_price: "4",
        unit: "portion",
        pickup_from: "19:00:00",
        pickup_until: "21:00:00",
        allergens: ["celery", "gluten"],
        serving_temperature: "HOT",
      });
    });

    it("drops meal details for categories other than meals", async () => {
      const response = await storeA
        .post("/api/donations")
        .send(donationPayload({ allergens: ["milk"], serving_temperature: "COLD" }));
      expect(response.status).toBe(201);
      expect(response.body.donation.allergens).toEqual([]);
      expect(response.body.donation.serving_temperature).toBeNull();
    });

    it.each([
      [{ name: "" }, "Sva polja su obavezna."],
      [{ original_price: undefined }, "Sva polja su obavezna."],
      [{ category: "Pizza" }, "Kategorija nije ispravna."],
      [{ unit: "box" }, "Jedinica mjere nije ispravna."],
      [{ quantity: 0 }, "Količina i vrijednost moraju biti pozitivni brojevi."],
      [{ donation_type: "GIFT" }, "Vrsta donacije nije ispravna."],
      [{ donation_type: "SPONSORED" }, "Donacijska cijena je obavezna i mora biti veća od nule."],
      [
        { donation_type: "SPONSORED", donation_price: 2 },
        "Donacijska cijena mora biti manja od vrijednosti proizvoda.",
      ],
      [{ expiry_date: "2020-01-01" }, "Datum isteka ne može biti u prošlosti."],
      [{ expiry_date: "2026-02-31" }, "Datum isteka nije ispravan."],
      [{ pickup_from: "25:00" }, "Vrijeme preuzimanja nije ispravno."],
      [{ pickup_from: "20:00", pickup_until: "19:00" }, "Početak preuzimanja mora biti prije kraja."],
      [{ category: "Meals", allergens: ["chocolate"] }, "Alergeni nisu ispravni."],
      [{ category: "Meals", serving_temperature: "WARM" }, "Način serviranja nije ispravan."],
    ])("rejects %o", async (overrides, error) => {
      const response = await storeA.post("/api/donations").send(donationPayload(overrides));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(error);
    });
  });

  describe("list and details", () => {
    it("lists only own donations, active first, with filters", async () => {
      const expired = await createDonation(storeA, { name: "Stari hljeb" });
      await pool.query("UPDATE donation_offers SET status = 'Expired' WHERE id = $1", [expired.id]);
      const sponsored = await createDonation(storeA, {
        name: "Jogurt",
        donation_type: "SPONSORED",
        donation_price: 1,
      });
      const removed = await createDonation(storeA, { name: "Obrisano" });
      await storeA.delete(`/api/donations/${removed.id}`);
      await createDonation(restaurant, MEAL);

      const all = await storeA.get("/api/donations/mine");
      expect(all.status).toBe(200);
      expect(all.body.donations.map((d: { id: number }) => d.id)).toEqual([sponsored.id, expired.id]);

      const byType = await storeA.get("/api/donations/mine").query({ type: "SPONSORED" });
      expect(byType.body.donations.map((d: { id: number }) => d.id)).toEqual([sponsored.id]);

      const byStatus = await storeA.get("/api/donations/mine").query({ status: "Expired" });
      expect(byStatus.body.donations.map((d: { id: number }) => d.id)).toEqual([expired.id]);

      const byName = await storeA.get("/api/donations/mine").query({ name: "jog" });
      expect(byName.body.donations.map((d: { id: number }) => d.id)).toEqual([sponsored.id]);
    });

    it("rejects unknown filters", async () => {
      for (const query of [{ type: "GIFT" }, { status: "Removed" }]) {
        const response = await storeA.get("/api/donations/mine").query(query);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Neispravan filter.");
      }
    });

    it("shows a donation only to its donor", async () => {
      const donation = await createDonation(storeA);
      const own = await storeA.get(`/api/donations/${donation.id}`);
      expect(own.status).toBe(200);
      expect(own.body.donation.id).toBe(donation.id);

      const other = await restaurant.get(`/api/donations/${donation.id}`);
      expect(other.status).toBe(404);
      expect(other.body.error).toBe("Donacija nije pronađena.");
      expect((await storeA.get("/api/donations/abc")).status).toBe(404);
    });
  });

  describe("update and delete", () => {
    it("updates an own active donation", async () => {
      const donation = await createDonation(storeA);
      const response = await storeA
        .put(`/api/donations/${donation.id}`)
        .send(donationPayload({ name: "Kifle", donation_type: "SPONSORED", donation_price: 1 }));
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Donacija uspješno ažurirana.");
      expect(response.body.donation).toMatchObject({ name: "Kifle", donation_price: "1" });
    });

    it("does not let another donor change or delete it", async () => {
      const donation = await createDonation(storeA);
      const update = await restaurant.put(`/api/donations/${donation.id}`).send(donationPayload());
      expect(update.status).toBe(403);
      expect(update.body.error).toBe("Nemate ovlasti za izmjenu ove donacije.");
      const remove = await restaurant.delete(`/api/donations/${donation.id}`);
      expect(remove.status).toBe(403);
      expect(remove.body.error).toBe("Nemate ovlasti za brisanje ove donacije.");
    });

    it("changes only active donations", async () => {
      const donation = await createDonation(storeA);
      await pool.query("UPDATE donation_offers SET status = 'Expired' WHERE id = $1", [donation.id]);
      const response = await storeA.put(`/api/donations/${donation.id}`).send(donationPayload());
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Samo aktivne donacije se mogu mijenjati.");
    });

    it("soft deletes a donation", async () => {
      const donation = await createDonation(storeA);
      const response = await storeA.delete(`/api/donations/${donation.id}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Donacija je obrisana.");
      const row = await pool.query("SELECT status FROM donation_offers WHERE id = $1", [donation.id]);
      expect(row.rows[0].status).toBe("Removed");
      expect((await storeA.delete(`/api/donations/${donation.id}`)).status).toBe(404);
    });
  });

  describe("move a product to donations", () => {
    it("moves the whole product and takes it off the marketplace", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const response = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Proizvod je prebačen u donacije.");
      expect(response.body.donation).toMatchObject({
        source_product_id: product.id,
        name: product.name,
        quantity: "10",
        donation_price: null,
      });
      const row = await pool.query("SELECT status FROM products WHERE id = $1", [product.id]);
      expect(row.rows[0].status).toBe("Removed");
    });

    it("moves part of the product and keeps the rest on offer", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const response = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "SPONSORED", quantity: 4, donation_price: 2 });
      expect(response.status).toBe(201);
      expect(response.body.donation).toMatchObject({ quantity: "4", donation_price: "2" });

      const offer = await restaurant.get(`/api/products/${product.id}`);
      expect(offer.body.product).toMatchObject({ status: "Available", quantity: "6" });
      expect(parseFloat(offer.body.product.available_quantity)).toBe(6);
    });

    it("donates only the unreserved quantity and keeps pending reservations", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const reservationId = await reserve(restaurant, product.id, 3);

      const response = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(response.status).toBe(201);
      expect(response.body.donation.quantity).toBe("7");

      const row = await pool.query("SELECT status, quantity FROM products WHERE id = $1", [product.id]);
      expect(row.rows[0]).toMatchObject({ status: "Available", quantity: "3" });
      const reservation = await pool.query("SELECT status FROM reservations WHERE id = $1", [reservationId]);
      expect(reservation.rows[0].status).toBe("Pending");
    });

    it("sells the product out when confirmed reservations cover the rest", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const reservationId = await reserve(restaurant, product.id, 4);
      await storeA.patch(`/api/reservations/${reservationId}/accept`);

      const response = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(response.status).toBe(201);
      const row = await pool.query("SELECT status, quantity FROM products WHERE id = $1", [product.id]);
      expect(row.rows[0]).toMatchObject({ status: "Sold", quantity: "4" });
    });

    it("adds a repeated move to the same donation", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const first = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 4 });
      const second = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 3 });

      expect(second.status).toBe(200);
      expect(second.body.message).toBe("Količina je dodana postojećoj donaciji.");
      expect(second.body.donation).toMatchObject({ id: first.body.donation.id, quantity: "7" });
      const mine = await storeA.get("/api/donations/mine");
      expect(mine.body.donations).toHaveLength(1);
      const row = await pool.query("SELECT quantity FROM products WHERE id = $1", [product.id]);
      expect(row.rows[0].quantity).toBe("3");
    });

    it("merges paid moves only at the same donation price", async () => {
      const product = await createProduct(storeA, { quantity: 10, original_price: 10 });
      const move = (body: Record<string, unknown>) =>
        storeA.post(`/api/donations/from-product/${product.id}`).send({ quantity: 1, ...body });

      expect((await move({ donation_type: "FREE" })).status).toBe(201);
      expect((await move({ donation_type: "SPONSORED", donation_price: 2 })).status).toBe(201);
      expect((await move({ donation_type: "SPONSORED", donation_price: "2.00" })).status).toBe(200);
      expect((await move({ donation_type: "SPONSORED", donation_price: 3 })).status).toBe(201);

      const mine = await storeA.get("/api/donations/mine");
      const quantities = mine.body.donations
        .map((d: { donation_type: string; donation_price: string | null; quantity: string }) =>
          `${d.donation_type}:${d.donation_price}:${d.quantity}`)
        .sort();
      expect(quantities).toEqual(["FREE:null:1", "SPONSORED:2:2", "SPONSORED:3:1"]);
    });

    it("starts a new donation when the earlier one is no longer active", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const first = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 2 });
      await storeA.delete(`/api/donations/${first.body.donation.id}`);

      const second = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 2 });
      expect(second.status).toBe(201);
      expect(second.body.donation.id).not.toBe(first.body.donation.id);
      expect(second.body.donation.quantity).toBe("2");
    });

    it("rejects more than is available and invalid input", async () => {
      const product = await createProduct(storeA, { quantity: 5, original_price: 10 });
      const tooMuch = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 6 });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.error).toBe("Nema dovoljno proizvoda na raspolaganju.");

      const zero = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE", quantity: 0 });
      expect(zero.body.error).toBe("Količina mora biti veća od nule.");

      const price = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "SPONSORED", donation_price: 10 });
      expect(price.status).toBe(400);
      expect(price.body.error).toBe("Donacijska cijena mora biti manja od vrijednosti proizvoda.");
    });

    it("moves only available, unexpired products", async () => {
      const product = await createProduct(storeA);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);
      const response = await storeA
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Samo dostupni proizvodi se mogu prebaciti u donacije.");
    });

    it("allows only the owning store", async () => {
      const product = await createProduct(storeA);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const other = await storeB
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(other.status).toBe(403);
      expect(other.body.error).toBe("Nemate ovlasti za doniranje ovog proizvoda.");

      const asRestaurant = await restaurant
        .post(`/api/donations/from-product/${product.id}`)
        .send({ donation_type: "FREE" });
      expect(asRestaurant.status).toBe(403);
      expect(asRestaurant.body.error).toBe("Nemate odgovarajuću rolu za ovu akciju.");

      const missing = await storeA
        .post("/api/donations/from-product/999999")
        .send({ donation_type: "FREE" });
      expect(missing.status).toBe(404);
    });
  });

  describe("return a donation to the offer", () => {
    const moveToDonations = async (productId: number, body: Record<string, unknown> = {}) => {
      const response = await storeA
        .post(`/api/donations/from-product/${productId}`)
        .send({ donation_type: "FREE", ...body });
      return response.body.donation.id as number;
    };
    const productRow = async (productId: number) =>
      (await pool.query("SELECT status, quantity FROM products WHERE id = $1", [productId])).rows[0];

    it("puts a fully moved product back on the marketplace", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const donationId = await moveToDonations(product.id);
      expect((await productRow(product.id)).status).toBe("Removed");

      const response = await storeA.post(`/api/donations/${donationId}/return-to-product`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Donacija je vraćena u ponudu.");
      expect(response.body.product).toMatchObject({ id: product.id, status: "Available", quantity: "10" });

      const donation = await pool.query("SELECT status FROM donation_offers WHERE id = $1", [donationId]);
      expect(donation.rows[0].status).toBe("Removed");
      const offer = await restaurant.get(`/api/products/${product.id}`);
      expect(parseFloat(offer.body.product.available_quantity)).toBe(10);
    });

    it("returns a merged donation's whole quantity", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      await moveToDonations(product.id, { quantity: 4 });
      const donationId = await moveToDonations(product.id, { quantity: 3 });

      await storeA.post(`/api/donations/${donationId}/return-to-product`);
      expect(await productRow(product.id)).toMatchObject({ status: "Available", quantity: "10" });
    });

    it("makes a sold-out product available again", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const reservationId = await reserve(restaurant, product.id, 4);
      await storeA.patch(`/api/reservations/${reservationId}/accept`);
      const donationId = await moveToDonations(product.id);
      expect((await productRow(product.id)).status).toBe("Sold");

      await storeA.post(`/api/donations/${donationId}/return-to-product`);
      expect(await productRow(product.id)).toMatchObject({ status: "Available", quantity: "10" });
    });

    it("refuses donations that can't go back", async () => {
      const manual = await createDonation(storeA);
      const noSource = await storeA.post(`/api/donations/${manual.id}/return-to-product`);
      expect(noSource.status).toBe(400);
      expect(noSource.body.error).toBe("Samo aktivne donacije iz ponude se mogu vratiti.");

      const product = await createProduct(storeA, { quantity: 10 });
      const donationId = await moveToDonations(product.id, { quantity: 2 });
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);
      const expiredProduct = await storeA.post(`/api/donations/${donationId}/return-to-product`);
      expect(expiredProduct.status).toBe(400);
      expect(expiredProduct.body.error).toBe("Proizvod je istekao i ne može se vratiti u ponudu.");

      await pool.query("UPDATE donation_offers SET status = 'Expired' WHERE id = $1", [donationId]);
      const expiredDonation = await storeA.post(`/api/donations/${donationId}/return-to-product`);
      expect(expiredDonation.body.error).toBe("Samo aktivne donacije iz ponude se mogu vratiti.");
    });

    it("allows only the donating store", async () => {
      const product = await createProduct(storeA, { quantity: 10 });
      const donationId = await moveToDonations(product.id);

      const storeB = await registerAndLogin(STORE_B, "STORE");
      const other = await storeB.post(`/api/donations/${donationId}/return-to-product`);
      expect(other.status).toBe(403);
      expect(other.body.error).toBe("Nemate ovlasti za izmjenu ove donacije.");

      const asRestaurant = await restaurant.post(`/api/donations/${donationId}/return-to-product`);
      expect(asRestaurant.status).toBe(403);

      expect((await storeA.post("/api/donations/999999/return-to-product")).status).toBe(404);
      expect((await productRow(product.id)).status).toBe("Removed");
    });
  });

  it("expires donations past their expiry date", async () => {
    const old = await createDonation(storeA);
    const fresh = await createDonation(storeA, { expiry_date: futureDate(0) });
    await pool.query("UPDATE donation_offers SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [old.id]);

    await expireProducts();

    const rows = await pool.query("SELECT id, status FROM donation_offers WHERE id = ANY($1) ORDER BY id", [
      [old.id, fresh.id],
    ]);
    expect(rows.rows.map((r) => r.status)).toEqual(["Expired", "Available"]);
  });
});
