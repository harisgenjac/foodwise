// Replaces all data with a small demo set: 3 stores, 2 restaurants, products and reservations.
// Deletes every existing user, so only run it against a development database.
//
// Usage: npm run seed
import "dotenv/config";
import bcrypt from "bcrypt";
import pool from "../config/db.js";

interface DemoUser {
  first_name: string;
  last_name: string;
  email: string;
  business_name: string;
  city: string;
  phone: string;
  address: string;
}

interface DemoProduct {
  name: string;
  category: string;
  original_price: number;
  discounted_price: number;
  quantity: number;
  unit: string;
  daysUntilExpiry: number;
  description: string;
}

type ReservationStatus = "Pending" | "Confirmed" | "Cancelled";

const STORES: DemoUser[] = [
  { first_name: "Amir", last_name: "Hodžić", email: "market.centar@demo.com", business_name: "Market Centar", city: "Sarajevo", phone: "061111111", address: "Ferhadija 5" },
  { first_name: "Selma", last_name: "Begić", email: "pekara.dobra@demo.com", business_name: "Pekara Dobra", city: "Tuzla", phone: "061222222", address: "Slatina 12" },
  { first_name: "Emir", last_name: "Kovač", email: "zeleni.market@demo.com", business_name: "Zeleni Market", city: "Mostar", phone: "061333333", address: "Bulevar 3" },
];

const RESTAURANTS: DemoUser[] = [
  { first_name: "Lejla", last_name: "Softić", email: "restoran.ukus@demo.com", business_name: "Restoran Ukus", city: "Sarajevo", phone: "062111111", address: "Titova 20" },
  { first_name: "Adnan", last_name: "Mešić", email: "pizzeria.roma@demo.com", business_name: "Pizzeria Roma", city: "Tuzla", phone: "062222222", address: "Trg 7" },
];

const PRODUCT_TEMPLATES: DemoProduct[] = [
  { name: "Pileći batak", category: "Meat", original_price: 12, discounted_price: 6, quantity: 15, unit: "kg", daysUntilExpiry: 2, description: "Svježi pileći bataci, čuvani na hladnom." },
  { name: "Mlijeko 3.2%", category: "Dairy", original_price: 2.5, discounted_price: 1.2, quantity: 40, unit: "kom", daysUntilExpiry: 1, description: "Pasterizovano mlijeko, kutija 1L." },
  { name: "Paradajz", category: "Vegetables", original_price: 4, discounted_price: 2, quantity: 25, unit: "kg", daysUntilExpiry: 3, description: "Domaći paradajz, blago prezreo za dužu upotrebu." },
  { name: "Jabuke Idared", category: "Fruits", original_price: 3, discounted_price: 1.5, quantity: 30, unit: "kg", daysUntilExpiry: 5, description: "Jabuke sa lokalnog voćnjaka." },
  { name: "Hljeb bijeli", category: "Bakery", original_price: 2, discounted_price: 0.8, quantity: 20, unit: "kom", daysUntilExpiry: 1, description: "Svježe pečen hljeb, dan star." },
  { name: "Sok od narandže", category: "Drinks", original_price: 3.5, discounted_price: 1.8, quantity: 18, unit: "kom", daysUntilExpiry: 10, description: "100% prirodni sok, 1L." },
  { name: "Smrznuto povrće mix", category: "Frozen Food", original_price: 5, discounted_price: 2.5, quantity: 12, unit: "kg", daysUntilExpiry: 30, description: "Mješavina povrća za variva." },
];

const RESERVATION_STATUSES: ReservationStatus[] = ["Pending", "Confirmed", "Cancelled"];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Brisanje postojećih podataka...");
    // Reservations first (RESTRICT); deleting users cascades to the rest.
    await client.query("DELETE FROM reservations");
    await client.query("DELETE FROM users");

    const passwordHash = await bcrypt.hash("demo12345", 10);

    const insertUser = async (user: DemoUser, role: "STORE" | "RESTAURANT") => {
      const result = await client.query<{ id: number }>(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [user.first_name, user.last_name, user.email, passwordHash, role, user.business_name, user.city, user.phone, user.address],
      );
      return result.rows[0]!.id;
    };

    console.log("Kreiranje store korisnika i proizvoda...");
    const storeIds: number[] = [];
    for (const store of STORES) {
      storeIds.push(await insertUser(store, "STORE"));
    }

    const products: { id: number; quantity: number }[] = [];
    for (const storeId of storeIds) {
      const selected = [...PRODUCT_TEMPLATES].sort(() => 0.5 - Math.random()).slice(0, 5);

      for (const p of selected) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + p.daysUntilExpiry);

        const result = await client.query<{ id: number }>(
          `INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [storeId, p.name, p.description, p.category, p.original_price, p.discounted_price, p.quantity, p.unit, expiryDate.toISOString().slice(0, 10)],
        );
        products.push({ id: result.rows[0]!.id, quantity: p.quantity });
      }
    }

    console.log("Kreiranje restaurant korisnika...");
    const restaurantIds: number[] = [];
    for (const restaurant of RESTAURANTS) {
      restaurantIds.push(await insertUser(restaurant, "RESTAURANT"));
    }

    console.log("Kreiranje rezervacija...");
    const reservationCount = Math.min(6, products.length);
    for (let i = 0; i < reservationCount; i++) {
      const product = products[i]!;
      const restaurantId = restaurantIds[i % restaurantIds.length]!;
      const status = RESERVATION_STATUSES[i % RESERVATION_STATUSES.length]!;
      const pickupDate = new Date();
      pickupDate.setDate(pickupDate.getDate() + 1);
      const reservedQty = Math.max(1, Math.floor(product.quantity * 0.2));

      await client.query(
        `INSERT INTO reservations (product_id, restaurant_id, quantity, status, pickup_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [product.id, restaurantId, reservedQty, status, pickupDate.toISOString()],
      );
    }

    await client.query("COMMIT");

    console.log("\n✅ Demo podaci uspješno kreirani!\n");
    console.log("Store nalozi (lozinka za sve: demo12345):");
    STORES.forEach((s) => console.log(`  - ${s.email} (${s.business_name})`));
    console.log("\nRestaurant nalozi (lozinka za sve: demo12345):");
    RESTAURANTS.forEach((r) => console.log(`  - ${r.email} (${r.business_name})`));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Greška prilikom seed-ovanja:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
