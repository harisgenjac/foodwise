import pool from "../src/config/db.js";
import { MAX_CSV_ROWS } from "../src/utils/productCsv.js";
import { cleanupUsers, futureDate, registerAndLogin, type Agent } from "./helpers.js";

const STORE = "import-store@test.com";
const RESTAURANT = "import-restaurant@test.com";

const HEADER = "name,description,category,original_price,discounted_price,quantity,unit,expiry_date";

const csv = (...lines: string[]) => Buffer.from(lines.join("\n"));

const upload = (agent: Agent, body: Buffer, filename = "products.csv", contentType = "text/csv") =>
  agent.post("/api/products/import").attach("file", body, { filename, contentType });

const productCount = async () => {
  const result = await pool.query(
    "SELECT COUNT(*) FROM products JOIN users ON products.store_id = users.id WHERE users.email = $1",
    [STORE],
  );
  return Number(result.rows[0].count);
};

let store: Agent;

describe("POST /api/products/import", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT]);
  });

  it("creates every product in the file for the store", async () => {
    const response = await upload(
      store,
      csv(
        HEADER,
        `Piletina,Svježa,Meat,10,5,4,kg,${futureDate()}`,
        `Hljeb,,Bakery,2,1,20,kom,${futureDate(2)}`,
      ),
    );
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Products imported: 2.");
    expect(response.body.products).toHaveLength(2);
    expect(response.body.products[0]).toMatchObject({ name: "Piletina", status: "Available" });
    expect(response.body.products[1].description).toBeNull();
    expect(await productCount()).toBe(2);
  });

  it("only checks the file on a dry run: counts the products and creates none", async () => {
    const file = csv(
      HEADER,
      `Piletina,Svježa,Meat,10,5,4,kg,${futureDate()}`,
      `Hljeb,,Bakery,2,1,20,kom,${futureDate(2)}`,
    );
    const response = await store
      .post("/api/products/import?dryRun=true")
      .attach("file", file, { filename: "products.csv", contentType: "text/csv" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "The file is valid.", count: 2 });
    expect(await productCount()).toBe(0);
  });

  it("reports row errors on a dry run like on an import", async () => {
    const response = await store
      .post("/api/products/import?dryRun=true")
      .attach("file", csv(HEADER, `Piletina,,Meat,10,5,4,kg,not-a-date`), {
        filename: "products.csv",
        contentType: "text/csv",
      });
    expect(response.status).toBe(400);
    expect(response.body.rowErrors).toHaveLength(1);
    expect(await productCount()).toBe(0);
  });

  it("reads Excel-style files with ';', a decimal comma, a BOM and DD.MM.YYYY dates", async () => {
    const [year, month, day] = futureDate().split("-");
    const response = await upload(
      store,
      csv(
        `﻿${HEADER.replaceAll(",", ";")}`,
        `Mlijeko;;Dairy;2,50;1,99;10;l;${day}.${month}.${year}`,
      ),
    );
    expect(response.status).toBe(201);
    expect(response.body.products[0]).toMatchObject({
      original_price: "2.50",
      discounted_price: "1.99",
    });
    expect(response.body.products[0].expiry_date).toBeTruthy();
  });

  it("reads the date formats Excel writes when it saves a CSV", async () => {
    const iso = futureDate();
    const [year, month, day] = iso.split("-") as [string, string, string];
    const d = String(Number(day));
    const m = String(Number(month));
    const serial = (Date.UTC(+year, +month - 1, +day) - Date.UTC(1899, 11, 30)) / 86_400_000;
    const dates = [
      `${d}. ${m}. ${year}.`,
      `${day}.${month}.${year.slice(2)}`,
      `${day}/${month}/${year}`,
      `${day}-${month}-${year}`,
      `${iso} 00:00:00`,
      `${year}/${month}/${day}`,
      String(serial),
    ];
    const response = await upload(
      store,
      csv(HEADER.replaceAll(",", ";"), ...dates.map((date) => `Hljeb;;Bakery;2;1;20;kom;${date}`)),
    );
    expect(response.status).toBe(201);
    const stored = await pool.query(
      "SELECT TO_CHAR(products.expiry_date, 'YYYY-MM-DD') AS expiry FROM products JOIN users ON products.store_id = users.id WHERE users.email = $1",
      [STORE],
    );
    expect(stored.rows.map((row) => row.expiry)).toEqual(dates.map(() => iso));
  });

  it("reads slashed dates month first when the file has a US-only date", async () => {
    // Day 25 can only be a day, so the whole file uses US order; 03/04 then means 4 March.
    const year = Number(futureDate().slice(0, 4)) + 1;
    const response = await upload(
      store,
      csv(
        HEADER,
        `Hljeb,,Bakery,2,1,20,kom,12/25/${year}`,
        `Sir,,Dairy,2,1,20,kom,03/04/${year}`,
      ),
    );
    expect(response.status).toBe(201);
    const stored = await pool.query(
      "SELECT products.name, TO_CHAR(products.expiry_date, 'YYYY-MM-DD') AS expiry FROM products JOIN users ON products.store_id = users.id WHERE users.email = $1 ORDER BY products.name",
      [STORE],
    );
    expect(stored.rows).toEqual([
      { name: "Hljeb", expiry: `${year}-12-25` },
      { name: "Sir", expiry: `${year}-03-04` },
    ]);
  });

  it("shows the date value it received when the date is invalid", async () => {
    const response = await upload(store, csv(HEADER, `Hljeb,,Bakery,2,1,20,kom,31.02.${futureDate().slice(0, 4)}`));
    expect(response.status).toBe(400);
    expect(response.body.rowErrors).toEqual([
      {
        row: 2,
        error: `Expiry date is not valid: "31.02.${futureDate().slice(0, 4)}". Use the format 31.12.2026.`,
      },
    ]);
  });

  it("rejects the whole file and lists every invalid row", async () => {
    const response = await upload(
      store,
      csv(
        HEADER,
        `Piletina,,Meat,10,5,4,kg,${futureDate()}`,
        `Riba,,Unknown,10,5,4,kg,${futureDate()}`,
        `Sir,,Dairy,5,10,4,kg,${futureDate()}`,
      ),
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The CSV contains invalid rows.");
    expect(response.body.rowErrors).toEqual([
      { row: 3, error: "Category is not valid." },
      { row: 4, error: "Discounted price cannot be higher than the original price." },
    ]);
    expect(await productCount()).toBe(0);
  });

  it("returns 400 when required columns are missing", async () => {
    const response = await upload(store, csv("name,category", "Piletina,Meat"));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "The CSV file is missing columns: original_price, discounted_price, quantity, unit, expiry_date.",
    );
  });

  it("returns 400 for a file with only a header", async () => {
    const response = await upload(store, csv(HEADER));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The CSV file does not contain any products.");
  });

  it("returns 400 when the file has too many rows", async () => {
    const row = `Hljeb,,Bakery,2,1,20,kom,${futureDate()}`;
    const response = await upload(store, csv(HEADER, ...Array(MAX_CSV_ROWS + 1).fill(row)));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(`The CSV file can contain at most ${MAX_CSV_ROWS} products.`);
  });

  it("returns 400 when no file is sent", async () => {
    const response = await store.post("/api/products/import");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("A CSV file is required.");
  });

  it("returns 400 for a file that is not CSV", async () => {
    const response = await upload(store, Buffer.from("x"), "products.xlsx", "application/octet-stream");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Only CSV files are allowed.");
  });

  it("returns 400 for a file over 1MB", async () => {
    const response = await upload(store, Buffer.alloc(1024 * 1024 + 1, "a"));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The file can be at most 1MB.");
  });

  it("returns 400 for a file that cannot be parsed", async () => {
    const response = await upload(store, csv(HEADER, '"Piletina,,Meat'));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The CSV file could not be read.");
  });

  it("returns 403 for a restaurant", async () => {
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    const response = await upload(restaurant, csv(HEADER));
    expect(response.status).toBe(403);
  });
});
