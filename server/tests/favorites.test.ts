import { cleanupUsers, registerAndLogin, userId, type Agent } from "./helpers.js";

const STORE_A = "favorites-store-a@test.com";
const STORE_B = "favorites-store-b@test.com";
const RESTAURANT_A = "favorites-restaurant-a@test.com";
const RESTAURANT_B = "favorites-restaurant-b@test.com";

let restaurant: Agent;
let storeId: number;

describe("Favorites routes", () => {
  beforeEach(async () => {
    const store = await registerAndLogin(STORE_A, "STORE");
    await store.put("/api/users/me").send({
      first_name: "Store",
      last_name: "A",
      business_name: "Omiljena Prodavnica",
      city: "Sarajevo",
      address: "Titova 1",
      phone: "061000000",
    });
    storeId = await userId(STORE_A);
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("POST /api/favorites", () => {
    it("adds a store to the favorites", async () => {
      const response = await restaurant.post("/api/favorites").send({ store_id: storeId });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Prodavnica dodana u omiljene");
    });

    it("returns 409 when the store is already a favorite", async () => {
      await restaurant.post("/api/favorites").send({ store_id: storeId });
      const response = await restaurant.post("/api/favorites").send({ store_id: storeId });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("Prodavnica je već dodana u omiljene.");
    });

    it("returns 400 without store_id", async () => {
      const response = await restaurant.post("/api/favorites").send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("ID prodavnice je obavezan.");
    });

    it("returns 404 for a store that does not exist", async () => {
      const response = await restaurant.post("/api/favorites").send({ store_id: 999999 });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Prodavnica nije pronađena.");
    });

    it("returns 404 for a user who is not a store", async () => {
      await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      const response = await restaurant.post("/api/favorites").send({ store_id: await userId(RESTAURANT_B) });
      expect(response.status).toBe(404);
    });

    it("returns 403 for a STORE", async () => {
      const storeB = await registerAndLogin(STORE_B, "STORE");
      const response = await storeB.post("/api/favorites").send({ store_id: storeId });
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/favorites", () => {
    it("lists only the restaurant's own favorites with store details", async () => {
      await restaurant.post("/api/favorites").send({ store_id: storeId });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurant.get("/api/favorites");
      expect(response.status).toBe(200);
      expect(response.body.favorites).toHaveLength(1);
      expect(response.body.favorites[0]).toMatchObject({
        id: storeId,
        business_name: "Omiljena Prodavnica",
        city: "Sarajevo",
      });
      expect(response.body.favorites[0].email).toBeUndefined();

      const other = await restaurantB.get("/api/favorites");
      expect(other.body.favorites).toEqual([]);
    });
  });

  describe("DELETE /api/favorites/:storeId", () => {
    it("removes a favorite", async () => {
      await restaurant.post("/api/favorites").send({ store_id: storeId });

      const response = await restaurant.delete(`/api/favorites/${storeId}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Prodavnica izbrisana iz omiljenih");
      expect((await restaurant.get("/api/favorites")).body.favorites).toEqual([]);
    });

    it("returns 404 when the store was not a favorite", async () => {
      const response = await restaurant.delete(`/api/favorites/${storeId}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Prodavnica nije bila u omiljenim.");
    });

    it("does not remove another restaurant's favorite", async () => {
      await restaurant.post("/api/favorites").send({ store_id: storeId });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurantB.delete(`/api/favorites/${storeId}`);
      expect(response.status).toBe(404);
      expect((await restaurant.get("/api/favorites")).body.favorites).toHaveLength(1);
    });
  });
});
