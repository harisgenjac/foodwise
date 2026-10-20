import { cleanupUsers, registerAndLogin, type Agent } from "./helpers.js";

const STORE_A = "templates-store-a@test.com";
const STORE_B = "templates-store-b@test.com";
const RESTAURANT = "templates-restaurant@test.com";

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

describe("Product templates routes", () => {
  let storeA: Agent;

  beforeEach(async () => {
    storeA = await registerAndLogin(STORE_A, "STORE");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  it("creates a template", async () => {
    const response = await storeA.post("/api/product-templates").send(TEMPLATE);
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Predložak uspješno sačuvan.");
    expect(response.body.template.name).toBe(TEMPLATE.name);
    expect(response.body.template.shelf_life_days).toBe(3);
  });

  it("stores only the required fields when the optional ones are empty", async () => {
    const response = await storeA.post("/api/product-templates").send({
      name: "Minimalni",
      category: "Dairy",
      unit: "kom",
      description: "",
      original_price: "",
      shelf_life_days: "",
    });
    expect(response.status).toBe(201);
    expect(response.body.template).toMatchObject({
      description: null,
      original_price: null,
      discounted_price: null,
      quantity: null,
      shelf_life_days: null,
    });
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

  it("lets two stores use the same template name", async () => {
    const storeB = await registerAndLogin(STORE_B, "STORE");
    expect((await storeA.post("/api/product-templates").send(TEMPLATE)).status).toBe(201);
    expect((await storeB.post("/api/product-templates").send(TEMPLATE)).status).toBe(201);
    expect((await storeA.get("/api/product-templates")).body.templates).toHaveLength(1);
  });

  it("returns only the calling store's templates", async () => {
    await storeA.post("/api/product-templates").send(TEMPLATE);
    const storeB = await registerAndLogin(STORE_B, "STORE");
    await storeB.post("/api/product-templates").send({ ...TEMPLATE, name: "Jogurt" });

    const response = await storeA.get("/api/product-templates");
    expect(response.status).toBe(200);
    expect(response.body.templates.map((t: { name: string }) => t.name)).toEqual([TEMPLATE.name]);
  });

  it.each(["name", "category", "unit"])("returns 400 without %s", async (field) => {
    const response = await storeA.post("/api/product-templates").send({ ...TEMPLATE, [field]: "" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Naziv, kategorija i jedinica mjere su obavezni.");
  });

  it("returns 403 for a RESTAURANT", async () => {
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    expect((await restaurant.get("/api/product-templates")).status).toBe(403);
    expect((await restaurant.post("/api/product-templates").send(TEMPLATE)).status).toBe(403);
  });

  it("returns 403 when deleting another store's template", async () => {
    const created = await storeA.post("/api/product-templates").send(TEMPLATE);
    const storeB = await registerAndLogin(STORE_B, "STORE");

    const response = await storeB.delete(`/api/product-templates/${created.body.template.id}`);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Nemate ovlasti za brisanje ovog predloška.");
    expect((await storeA.get("/api/product-templates")).body.templates).toHaveLength(1);
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
