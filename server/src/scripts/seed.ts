// Replaces ALL data with demo data: the demo stores and restaurants below, then random
// products and reservations from fakeData.ts. Every demo account uses the password demo12345.
//
// Usage: npm run seed
import "dotenv/config";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { insertFakeData, printSummary } from "./fakeData.js";

interface DemoUser {
  first_name: string;
  last_name: string;
  email: string;
  business_name: string;
  city: string;
  phone: string;
  address: string;
}

const DEMO_PASSWORD = "demo12345";

const STORES: DemoUser[] = [
  { first_name: "Amir", last_name: "Hodžić", email: "market.centar@demo.com", business_name: "Market Centar", city: "Sarajevo", phone: "061111111", address: "Ferhadija 5" },
  { first_name: "Selma", last_name: "Begić", email: "pekara.dobra@demo.com", business_name: "Pekara Dobra", city: "Tuzla", phone: "061222222", address: "Slatina 12" },
  { first_name: "Emir", last_name: "Kovač", email: "zeleni.market@demo.com", business_name: "Zeleni Market", city: "Mostar", phone: "061333333", address: "Bulevar 3" },
];

const RESTAURANTS: DemoUser[] = [
  { first_name: "Lejla", last_name: "Softić", email: "restoran.ukus@demo.com", business_name: "Restoran Ukus", city: "Sarajevo", phone: "062111111", address: "Titova 20" },
  { first_name: "Adnan", last_name: "Mešić", email: "pizzeria.roma@demo.com", business_name: "Pizzeria Roma", city: "Tuzla", phone: "062222222", address: "Trg 7" },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Brisanje postojećih podataka...");
    // Reservations reference users and products with RESTRICT; everything else cascades from users.
    await client.query("DELETE FROM notifications");
    await client.query("DELETE FROM reservations");
    await client.query("DELETE FROM products");
    await client.query("DELETE FROM users");

    console.log("Kreiranje demo naloga...");
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const users: [DemoUser, "STORE" | "RESTAURANT"][] = [
      ...STORES.map((store): [DemoUser, "STORE"] => [store, "STORE"]),
      ...RESTAURANTS.map((restaurant): [DemoUser, "RESTAURANT"] => [restaurant, "RESTAURANT"]),
    ];
    for (const [user, role] of users) {
      await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.first_name, user.last_name, user.email, passwordHash, role, user.business_name, user.city, user.phone, user.address],
      );
    }

    console.log("Kreiranje proizvoda i rezervacija...");
    const summary = await insertFakeData(client, { productsPerStore: 5, reservationsPerRestaurant: 4 });

    await client.query("COMMIT");

    printSummary(summary);
    console.log(`\nDemo podaci uspješno kreirani. Lozinka za sve naloge: ${DEMO_PASSWORD}`);
    console.log("Prodavnice:");
    STORES.forEach((store) => console.log(`  - ${store.email} (${store.business_name})`));
    console.log("Restorani:");
    RESTAURANTS.forEach((restaurant) => console.log(`  - ${restaurant.email} (${restaurant.business_name})`));
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
