import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

const EMAILS = ["store-a@test.com", "store-b@test.com", "restaurant-a@test.com"];

const TEMPLATE = {
  name: "Pileći file",
  description: "Svježi pileći file",
  category: "Meat",
  unit: "kg",
  original_price: 14,
  discounted_price: 8,
  quantity: 10,
  shelf_life_days: 3,
};

const loginAs = async (email, role) => {
  await request(app).post("/api/auth/register").send({
    first_name: "Test",
    last_name: "User",
    email,
    password: "test12345",
    role,
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "test12345" });
  return agent;
};

describe("Product templates routes", () => {
  let storeA;

  beforeEach(async () => {
    storeA = await loginAs("store-a@test.com", "STORE");
  });

  afterEach(async () => {
    // product_templates rows are removed by ON DELETE CASCADE.
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [EMAILS]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a template", async () => {
    const response = await storeA.post("/api/product-templates").send(TEMPLATE);
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Predložak uspješno sačuvan.");
    expect(response.body.template.name).toBe(TEMPLATE.name);
    expect(response.body.template.shelf_life_days).toBe(3);
  });

  it("updates the existing template when the same name is saved again", async () => {
    await storeA.post("/api/product-templates").send(TEMPLATE);
    const response = await storeA
      .post("/api/product-templates")
      .send({ ...TEMPLATE, discounted_price: 7, quantity: "" });
    expect(response.status).toBe(201);
    expect(parseFloat(response.body.template.discounted_price)).toBe(7);
    expect(response.body.template.quantity).toBeNull();

    const list = await storeA.get("/api/product-templates");
    expect(list.body.templates).toHaveLength(1);
  });

  it("returns only the calling store's templates", async () => {
    await storeA.post("/api/product-templates").send(TEMPLATE);
    const storeB = await loginAs("store-b@test.com", "STORE");
    await storeB.post("/api/product-templates").send({ ...TEMPLATE, name: "Jogurt" });

    const response = await storeA.get("/api/product-templates");
    expect(response.status).toBe(200);
    expect(response.body.templates.map((t) => t.name)).toEqual([TEMPLATE.name]);
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await storeA
      .post("/api/product-templates")
      .send({ name: "Bez kategorije" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Naziv, kategorija i jedinica mjere su obavezni.",
    );
  });

  it("returns 403 for a RESTAURANT user", async () => {
    const restaurant = await loginAs("restaurant-a@test.com", "RESTAURANT");
    const response = await restaurant.get("/api/product-templates");
    expect(response.status).toBe(403);
  });

  it("returns 403 when deleting another store's template", async () => {
    const created = await storeA.post("/api/product-templates").send(TEMPLATE);
    const storeB = await loginAs("store-b@test.com", "STORE");

    const response = await storeB.delete(
      `/api/product-templates/${created.body.template.id}`,
    );
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Nemate ovlasti za brisanje ovog predloška.");
  });

  it("deletes an own template and returns 404 afterwards", async () => {
    const created = await storeA.post("/api/product-templates").send(TEMPLATE);
    const id = created.body.template.id;

    const deleted = await storeA.delete(`/api/product-templates/${id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.message).toBe("Predložak uspješno obrisan.");

    const again = await storeA.delete(`/api/product-templates/${id}`);
    expect(again.status).toBe(404);
    expect(again.body.error).toBe("Predložak nije pronađen.");
  });
});
