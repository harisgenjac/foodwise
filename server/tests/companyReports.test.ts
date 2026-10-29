import pool from "../src/config/db.js";
import {
  type Agent,
  cleanupCompanies,
  cleanupUsers,
  futureDate,
  insertCompany,
  insertUser,
  login,
  userId,
} from "./helpers.js";

// The headquarters' reports over its branches follow the rules of a store's own reports.

const HQ = "coreports-hq@test.com";
const OTHER_HQ = "coreports-other-hq@test.com";
const CENTAR = "coreports-centar@test.com";
const BREZA = "coreports-breza@test.com";
const QUIET = "coreports-quiet@test.com";
const OTHER_BRANCH = "coreports-other-branch@test.com";
const RESTAURANT_A = "coreports-restaurant-a@test.com";
const RESTAURANT_B = "coreports-restaurant-b@test.com";
const EMAILS = [HQ, OTHER_HQ, CENTAR, BREZA, QUIET, OTHER_BRANCH, RESTAURANT_A, RESTAURANT_B];

const COMPANY = "Coreports Chain";
const OTHER_COMPANY = "Coreports Other Chain";
const REPORTS = ["sales", "impact", "branches"];

let hq: Agent;
let centarId: number;
let brezaId: number;
let quietId: number;
let otherBranchId: number;

// A pickup `daysAgo` days before today of a new product of the store (the API cannot backdate it).
const insertPickup = async (
  storeId: number,
  restaurantEmail: string,
  { daysAgo = 1, quantity = 2, unitPrice = 5, unit = "kg", status = "Completed" } = {},
) => {
  const product = await pool.query<{ id: number }>(
    `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
     VALUES ($1, 'Kruh', 'Bakery', 10, 5, 100, $2, CURRENT_DATE + 3) RETURNING id`,
    [storeId, unit],
  );
  await pool.query(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at)
     VALUES ($1, $2, $3, $4, $5::reservation_status, (CURRENT_DATE - $6::int) + time '10:00',
             CASE WHEN $5::reservation_status = 'Completed' THEN (CURRENT_DATE - $6::int) + time '12:00' END)`,
    [product.rows[0]!.id, await userId(restaurantEmail), quantity, unitPrice, status, daysAgo],
  );
};

const parse = (text: string) =>
  text
    .replace(/^﻿/, "")
    .split("\r\n")
    .filter(Boolean)
    .map((line) => line.split(";"));

const period = (fromDaysAgo = 30, toDaysAgo = 0) => ({ from: futureDate(-fromDaysAgo), to: futureDate(-toDaysAgo) });

const report = async (name: string, query: Record<string, unknown> = {}) => {
  const response = await hq.get(`/api/company/reports/${name}`).query({ ...period(), ...query });
  expect(response.status).toBe(200);
  return { response, rows: parse(response.text) };
};

beforeEach(async () => {
  const companyId = await insertCompany(COMPANY);
  const otherCompanyId = await insertCompany(OTHER_COMPANY);
  await insertUser(HQ, "COMPANY", null, null, companyId);
  await insertUser(OTHER_HQ, "COMPANY", null, null, otherCompanyId);
  await insertUser(CENTAR, "STORE", "Coreports Centar", 10, companyId);
  await insertUser(BREZA, "STORE", "Coreports Breza", 10, companyId);
  await insertUser(QUIET, "STORE", "Coreports Mirna", 10, companyId);
  await insertUser(OTHER_BRANCH, "STORE", "Coreports Other", 10, otherCompanyId);
  await insertUser(RESTAURANT_A, "RESTAURANT", "Restoran A");
  await insertUser(RESTAURANT_B, "RESTAURANT", "Restoran B");
  centarId = await userId(CENTAR);
  brezaId = await userId(BREZA);
  quietId = await userId(QUIET);
  otherBranchId = await userId(OTHER_BRANCH);
  // Breza is deactivated; its history stays in the reports.
  await pool.query("UPDATE users SET deactivated_at = NOW() WHERE id = $1", [brezaId]);

  await insertPickup(centarId, RESTAURANT_A, { daysAgo: 3, quantity: 2, unitPrice: 5 });
  await insertPickup(centarId, RESTAURANT_B, { daysAgo: 2, quantity: 4, unitPrice: 2.5, unit: "kom" });
  await insertPickup(brezaId, RESTAURANT_A, { daysAgo: 1, quantity: 1.5, unitPrice: 4, unit: "l" });
  // Not counted: open, cancelled, outside the period, another company.
  await insertPickup(centarId, RESTAURANT_A, { status: "Pending" });
  await insertPickup(centarId, RESTAURANT_A, { status: "Cancelled" });
  await insertPickup(centarId, RESTAURANT_A, { daysAgo: 60 });
  await insertPickup(otherBranchId, RESTAURANT_A, { daysAgo: 1 });
  hq = await login(HQ);
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY, OTHER_COMPANY]);
});

describe("company reports", () => {
  it("are only for the headquarters", async () => {
    const branch = await login(CENTAR);
    for (const name of REPORTS) {
      expect((await branch.get(`/api/company/reports/${name}`).query(period())).status).toBe(403);
    }
  });

  it.each([
    ["missing dates", {}],
    ["an invalid date", { from: "2026-02-31", to: "2026-03-01" }],
    ["from after to", { from: "2026-03-02", to: "2026-03-01" }],
    ["more than 366 days", { from: "2025-01-01", to: "2026-01-02" }],
  ])("reject %s", async (_label, query) => {
    for (const name of REPORTS) {
      const response = await hq.get(`/api/company/reports/${name}`).query(query);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid period.");
    }
  });

  it("answer 404 for a branch of another company or an invalid id", async () => {
    for (const name of REPORTS) {
      for (const branchId of [otherBranchId, "abc"]) {
        const response = await hq.get(`/api/company/reports/${name}`).query({ ...period(), branch_id: branchId });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe("Branch not found.");
      }
    }
  });

  describe("GET /api/company/reports/sales", () => {
    it("lists every branch's pickups with the branch first", async () => {
      const { response, rows } = await report("sales");
      expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(response.headers["content-disposition"]).toBe(
        `attachment; filename="prodaja-firma-${period().from}-${period().to}.csv"`,
      );
      expect(rows[0]).toEqual([
        "Poslovnica",
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
      expect(rows.slice(1, -1).map((row) => [row[0], row[5]])).toEqual([
        ["Coreports Centar", "Restoran A"],
        ["Coreports Centar", "Restoran B"],
        ["Coreports Breza", "Restoran A"],
      ]);
      // 10 + 10 + 6 paid; savings 10 + 30 + 9.
      expect(rows.at(-1)).toEqual(["Ukupno", "", "", "", "", "", "", "", "", "", "", "26", "49"]);
    });

    it("narrows to one branch, in English", async () => {
      const { response, rows } = await report("sales", { branch_id: brezaId, lang: "en" });
      expect(response.headers["content-disposition"]).toBe(
        `attachment; filename="company-sales-${period().from}-${period().to}.csv"`,
      );
      expect(rows[0]!.slice(0, 3)).toEqual(["Branch", "Pickup date", "Reservation no."]);
      expect(rows.slice(1, -1).map((row) => row[0])).toEqual(["Coreports Breza"]);
      expect(rows.at(-1)!.slice(-2)).toEqual(["6", "9"]);
    });
  });

  describe("GET /api/company/reports/impact", () => {
    it("adds up the company per month, counting each restaurant once", async () => {
      const { response, rows } = await report("impact");
      expect(response.headers["content-disposition"]).toContain('filename="uticaj-firma-');
      expect(rows[0]![2]).toBe("Broj restorana");
      const total = rows.at(-1)!;
      // 3 pickups by 2 restaurants: 2 kg, 1,50 l, 4 pieces, 26 KM paid, 49 KM saved.
      expect(total).toEqual(["Ukupno", "3", "2", "2", "1,50", "4", "26", "49"]);
    });

    it("narrows to one branch, in English", async () => {
      const { response, rows } = await report("impact", { branch_id: centarId, lang: "en" });
      expect(response.headers["content-disposition"]).toContain('filename="company-impact-');
      expect(rows[0]).toEqual([
        "Month",
        "Pickups",
        "Restaurants",
        "Food saved (kg)",
        "Food saved (l)",
        "Food saved (pcs)",
        "Value (KM)",
        "Savings (KM)",
      ]);
      expect(rows.at(-1)).toEqual(["Total", "2", "2", "2", "0", "4", "20", "40"]);
    });
  });

  describe("GET /api/company/reports/branches", () => {
    it("has a row per branch, also without pickups or deactivated, and a total", async () => {
      const { response, rows } = await report("branches");
      expect(response.headers["content-disposition"]).toContain('filename="poslovnice-');
      expect(rows).toEqual([
        [
          "Poslovnica",
          "Status",
          "Broj preuzimanja",
          "Broj restorana",
          "Spašena hrana (kg)",
          "Spašena hrana (l)",
          "Spašena hrana (kom)",
          "Vrijednost (KM)",
          "Ušteda (KM)",
        ],
        ["Coreports Breza", "Deaktivirana", "1", "1", "0", "1,50", "0", "6", "9"],
        ["Coreports Centar", "Aktivna", "2", "2", "2", "0", "4", "20", "40"],
        ["Coreports Mirna", "Aktivna", "0", "0", "0", "0", "0", "0", "0"],
        // Restoran A bought from two branches but is one partner.
        ["Ukupno", "", "3", "2", "2", "1,50", "4", "26", "49"],
      ]);
    });

    it("narrows to one branch, in English", async () => {
      const { response, rows } = await report("branches", { branch_id: quietId, lang: "en" });
      expect(response.headers["content-disposition"]).toContain('filename="branches-');
      expect(rows[0]!.slice(0, 4)).toEqual(["Branch", "Status", "Pickups", "Restaurants"]);
      expect(rows.slice(1)).toEqual([
        ["Coreports Mirna", "Active", "0", "0", "0", "0", "0", "0", "0"],
        ["Total", "", "0", "0", "0", "0", "0", "0", "0"],
      ]);
    });
  });
});
