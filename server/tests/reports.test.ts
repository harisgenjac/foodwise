import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, futureDate, registerAndLogin, userId, type Agent } from "./helpers.js";

const STORE_A = "reports-store-a@test.com";
const STORE_B = "reports-store-b@test.com";
const RESTAURANT_A = "reports-restaurant-a@test.com";
const RESTAURANT_B = "reports-restaurant-b@test.com";

let store: Agent;
let restaurant: Agent;

const setBusiness = async (email: string, businessName: string, city: string) => {
  await pool.query("UPDATE users SET business_name = $1, city = $2 WHERE email = $3", [businessName, city, email]);
};

// Inserts a reservation picked up `daysAgo` days before today (the API cannot backdate a pickup).
const insertPickup = async (
  productId: number,
  restaurantEmail: string,
  { daysAgo = 1, quantity = 2, unitPrice = 5, status = "Completed" }: {
    daysAgo?: number;
    quantity?: number;
    unitPrice?: number;
    status?: string;
  } = {},
) => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at)
     VALUES ($1, $2, $3, $4, $5::reservation_status, (CURRENT_DATE - $6::int) + time '10:00',
             CASE WHEN $5::reservation_status = 'Completed' THEN (CURRENT_DATE - $6::int) + time '12:00' END)
     RETURNING id`,
    [productId, await userId(restaurantEmail), quantity, unitPrice, status, daysAgo],
  );
  return result.rows[0]!.id;
};

// Parses the CSV body into rows of cells (no quoted fields are used in these tests).
const parse = (text: string) =>
  text
    .replace(/^﻿/, "")
    .split("\r\n")
    .filter(Boolean)
    .map((line) => line.split(";"));

const period = (fromDaysAgo = 30, toDaysAgo = 0) => ({ from: futureDate(-fromDaysAgo), to: futureDate(-toDaysAgo) });

describe("Reports", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
    await setBusiness(STORE_A, "Market A", "Sarajevo");
    await setBusiness(RESTAURANT_A, "Restoran A", "Tuzla");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("period validation", () => {
    it("requires a login", async () => {
      const response = await request(app).get("/api/reports/sales").query(period());
      expect(response.status).toBe(401);
    });

    it.each([
      ["missing dates", {}],
      ["an invalid date", { from: "2026-02-31", to: "2026-03-01" }],
      ["a wrong format", { from: "01.03.2026", to: "2026-03-31" }],
      ["from after to", { from: "2026-03-02", to: "2026-03-01" }],
      ["more than 366 days", { from: "2025-01-01", to: "2026-01-02" }],
    ])("rejects %s", async (_label, query) => {
      for (const report of ["sales", "impact"]) {
        const response = await store.get(`/api/reports/${report}`).query(query);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Neispravan period.");
      }
    });

    it("accepts a full leap year and a single day", async () => {
      expect((await store.get("/api/reports/sales").query({ from: "2028-01-01", to: "2028-12-31" })).status).toBe(200);
      expect((await store.get("/api/reports/impact").query({ from: "2026-05-05", to: "2026-05-05" })).status).toBe(200);
    });
  });

  describe("GET /api/reports/sales", () => {
    it("sends a CSV attachment named after the role and the period", async () => {
      const { from, to } = period();
      const storeResponse = await store.get("/api/reports/sales").query({ from, to });
      expect(storeResponse.status).toBe(200);
      expect(storeResponse.headers["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
      expect(storeResponse.headers["content-disposition"]).toBe(`attachment; filename="prodaja-${from}-${to}.csv"`);
      expect(storeResponse.text.startsWith("﻿Datum preuzimanja;")).toBe(true);

      const restaurantResponse = await restaurant.get("/api/reports/sales").query({ from, to, lang: "en" });
      expect(restaurantResponse.headers["content-disposition"]).toBe(
        `attachment; filename="purchases-${from}-${to}.csv"`,
      );
    });

    it("lists the store's picked-up reservations in the period with the restaurant and totals", async () => {
      const product = await createProduct(store, { name: "Piletina", category: "Meat", original_price: 10, quantity: 50 });
      const first = await insertPickup(product.id, RESTAURANT_A, { daysAgo: 3, quantity: 2, unitPrice: 6.5 });
      const second = await insertPickup(product.id, RESTAURANT_A, { daysAgo: 1, quantity: 1.5, unitPrice: 6 });
      // Not in the report: still open, out of the period, or another store's sale.
      await insertPickup(product.id, RESTAURANT_A, { status: "Confirmed" });
      await insertPickup(product.id, RESTAURANT_A, { daysAgo: 40 });
      const otherStore = await registerAndLogin(STORE_B, "STORE");
      await insertPickup((await createProduct(otherStore)).id, RESTAURANT_A);

      const response = await store.get("/api/reports/sales").query(period());
      const [headers, ...rows] = parse(response.text);

      expect(headers).toEqual([
        "Datum preuzimanja",
        "Broj rezervacije",
        "Proizvod",
        "Kategorija",
        "Restoran",
        "Grad",
        "Količina",
        "Jedinica",
        "Cijena po jedinici (KM)",
        "Originalna cijena (KM)",
        "Ukupno (KM)",
        "Ušteda (KM)",
      ]);
      expect(rows).toEqual([
        [futureDate(-3), String(first), "Piletina", "Meso", "Restoran A", "Tuzla", "2", "kg", "6,50", "10", "13", "7"],
        [futureDate(-1), String(second), "Piletina", "Meso", "Restoran A", "Tuzla", "1,50", "kg", "6", "10", "9", "6"],
        ["Ukupno", "", "", "", "", "", "", "", "", "", "22", "13"],
      ]);
    });

    it("lists only the restaurant's own purchases, with the store as the other party, in English", async () => {
      const product = await createProduct(store, { name: "Mlijeko", category: "Dairy", unit: "l", quantity: 50 });
      const mine = await insertPickup(product.id, RESTAURANT_A, { quantity: 4 });
      await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await insertPickup(product.id, RESTAURANT_B);

      const response = await restaurant.get("/api/reports/sales").query({ ...period(), lang: "en" });
      const [headers, ...rows] = parse(response.text);

      expect(headers?.slice(0, 6)).toEqual(["Pickup date", "Reservation no.", "Product", "Category", "Store", "City"]);
      expect(rows).toEqual([
        [futureDate(-1), String(mine), "Mlijeko", "Dairy Products", "Market A", "Sarajevo", "4", "l", "5", "10", "20", "20"],
        ["Total", "", "", "", "", "", "", "", "", "", "20", "20"],
      ]);
    });

    it("keeps user text that starts like a formula from running in Excel", async () => {
      const product = await createProduct(store, { name: "=HYPERLINK(1)" });
      await insertPickup(product.id, RESTAURANT_A);

      const response = await store.get("/api/reports/sales").query(period());
      expect(parse(response.text)[1]?.[2]).toBe("'=HYPERLINK(1)");
    });

    it("has only the header and a zero total when nothing was picked up", async () => {
      const response = await store.get("/api/reports/sales").query(period());
      expect(parse(response.text).slice(1)).toEqual([["Ukupno", "", "", "", "", "", "", "", "", "", "0", "0"]]);
    });
  });

  describe("GET /api/reports/impact", () => {
    it("adds up food saved per month in kg, l and pieces, plus a total row", async () => {
      const kg = await createProduct(store, { unit: "kg", quantity: 100, original_price: 10 });
      const grams = await createProduct(store, { unit: "g", quantity: 5000, original_price: 1, discounted_price: 0.5 });
      const ml = await createProduct(store, { unit: "ml", quantity: 5000, original_price: 1, discounted_price: 0.5 });
      const pieces = await createProduct(store, { unit: "kom", quantity: 100, original_price: 10 });
      const packs = await createProduct(store, { unit: "pak", quantity: 100, original_price: 10 });
      await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      // Two months: 40 and 80 days ago always fall in different months.
      await insertPickup(kg.id, RESTAURANT_A, { daysAgo: 80, quantity: 2, unitPrice: 5 });
      await insertPickup(grams.id, RESTAURANT_A, { daysAgo: 40, quantity: 500, unitPrice: 0.5 });
      await insertPickup(ml.id, RESTAURANT_B, { daysAgo: 40, quantity: 1500, unitPrice: 0.5 });
      await insertPickup(pieces.id, RESTAURANT_B, { daysAgo: 40, quantity: 3, unitPrice: 5 });
      await insertPickup(packs.id, RESTAURANT_B, { daysAgo: 40, quantity: 2, unitPrice: 5 });
      await insertPickup(kg.id, RESTAURANT_A, { daysAgo: 40, status: "Confirmed" });

      const month = async (daysAgo: number) =>
        (await pool.query<{ month: string }>("SELECT to_char(CURRENT_DATE - $1::int, 'YYYY-MM') AS month", [daysAgo]))
          .rows[0]!.month;

      const response = await store.get("/api/reports/impact").query(period(100));
      const [headers, ...rows] = parse(response.text);

      expect(headers).toEqual([
        "Mjesec",
        "Broj preuzimanja",
        "Broj restorana",
        "Spašena hrana (kg)",
        "Spašena hrana (l)",
        "Spašena hrana (kom)",
        "Vrijednost (KM)",
        "Ušteda (KM)",
      ]);
      expect(rows).toEqual([
        [await month(80), "1", "1", "2", "0", "0", "10", "10"],
        [await month(40), "4", "2", "0,50", "1,50", "5", "1025", "1025"],
        ["Ukupno", "5", "2", "2,50", "1,50", "5", "1035", "1035"],
      ]);
    });

    it("counts stores for a restaurant and returns a zero total for an empty period", async () => {
      const response = await restaurant.get("/api/reports/impact").query({ ...period(), lang: "en" });
      const [headers, ...rows] = parse(response.text);
      expect(headers?.[2]).toBe("Stores");
      expect(rows).toEqual([["Total", "0", "0", "0", "0", "0", "0", "0"]]);
      expect(response.headers["content-disposition"]).toContain('filename="impact-');
    });
  });
});
