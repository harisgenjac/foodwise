// Fake products and reservations for the users already in the database, shared by
// `npm run seed` (after it creates the demo accounts) and `npm run seed:fake`.
// Never creates, changes or deletes users.
import type { PoolClient } from "pg";
import { createNotification } from "../utils/notifications.js";

interface ProductTemplate {
  name: string;
  description: string;
  category: string;
  unit: string;
  price: [number, number];
  quantity: [number, number];
}

interface SeededProduct {
  id: number;
  storeId: number;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  reserved: number;
}

type ReservationStatus = "Pending" | "Confirmed" | "Completed" | "Rejected" | "Cancelled";

export interface FakeDataOptions {
  productsPerStore: number;
  reservationsPerRestaurant: number;
}

export interface FakeDataSummary {
  products: number;
  stores: number;
  restaurants: number;
  reservations: Record<ReservationStatus, number>;
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  { name: "Pileći batak", description: "Svježi pileći bataci, čuvani na hladnom.", category: "Meat", unit: "kg", price: [9, 14], quantity: [8, 25] },
  { name: "Mljeveno juneće meso", description: "Mješavina za ćevape i umake.", category: "Meat", unit: "kg", price: [14, 20], quantity: [5, 15] },
  { name: "Teleći odrezak", description: "Odresci spremni za roštilj.", category: "Meat", unit: "kg", price: [22, 30], quantity: [3, 10] },
  { name: "Filet lososa", description: "Svježi filet, isporuka od jutros.", category: "Fish", unit: "kg", price: [28, 40], quantity: [3, 8] },
  { name: "Pastrmka", description: "Domaća riječna pastrmka, očišćena.", category: "Fish", unit: "kg", price: [14, 20], quantity: [4, 12] },
  { name: "Mlijeko 3.2%", description: "Pasterizovano mlijeko, kutija 1L.", category: "Dairy", unit: "kom", price: [2, 3], quantity: [20, 60] },
  { name: "Jogurt", description: "Tečni jogurt, 1L.", category: "Dairy", unit: "kom", price: [2, 3], quantity: [20, 50] },
  { name: "Sir trapist", description: "Polutvrdi sir, rezan po potrebi.", category: "Dairy", unit: "kg", price: [12, 18], quantity: [4, 12] },
  { name: "Pavlaka", description: "Kisela pavlaka 20% mm, 500g.", category: "Dairy", unit: "kom", price: [3, 4], quantity: [10, 30] },
  { name: "Paradajz", description: "Domaći paradajz, zreo za salate i umake.", category: "Vegetables", unit: "kg", price: [3, 5], quantity: [10, 40] },
  { name: "Paprika", description: "Crvena i zelena paprika.", category: "Vegetables", unit: "kg", price: [3, 6], quantity: [10, 30] },
  { name: "Krompir", description: "Mladi krompir iz lokalnog uzgoja.", category: "Vegetables", unit: "kg", price: [1, 2], quantity: [30, 80] },
  { name: "Zelena salata", description: "Svježa salata, ubrana juče.", category: "Vegetables", unit: "kom", price: [1, 2], quantity: [15, 40] },
  { name: "Jabuke Idared", description: "Jabuke sa lokalnog voćnjaka.", category: "Fruits", unit: "kg", price: [2, 4], quantity: [15, 50] },
  { name: "Banane", description: "Zrele banane, idealne za deserte.", category: "Fruits", unit: "kg", price: [3, 4], quantity: [10, 30] },
  { name: "Jagode", description: "Svježe jagode, pakovanje 500g.", category: "Fruits", unit: "pak", price: [4, 7], quantity: [8, 20] },
  { name: "Hljeb bijeli", description: "Svježe pečen hljeb, dan star.", category: "Bakery", unit: "kom", price: [1.5, 2.5], quantity: [15, 40] },
  { name: "Kroasani", description: "Kroasani od maslaca, pakovanje 6 kom.", category: "Bakery", unit: "pak", price: [5, 8], quantity: [5, 15] },
  { name: "Somun", description: "Tradicionalni somun.", category: "Bakery", unit: "kom", price: [1, 2], quantity: [20, 50] },
  { name: "Sok od narandže", description: "100% prirodni sok, 1L.", category: "Drinks", unit: "kom", price: [3, 5], quantity: [10, 30] },
  { name: "Mineralna voda", description: "Gazirana mineralna voda, 1.5L.", category: "Drinks", unit: "kom", price: [1, 2], quantity: [24, 72] },
  { name: "Smrznuto povrće mix", description: "Mješavina povrća za variva.", category: "Frozen Food", unit: "kg", price: [4, 6], quantity: [8, 20] },
  { name: "Smrznuti pomfrit", description: "Pomfrit za prženje, vreća 2.5kg.", category: "Frozen Food", unit: "pak", price: [7, 10], quantity: [6, 20] },
  { name: "Maslinovo ulje", description: "Ekstra djevičansko, 1L.", category: "Other", unit: "l", price: [15, 22], quantity: [5, 15] },
];

const STATUS_WEIGHTS: [ReservationStatus, number][] = [
  ["Pending", 4],
  ["Confirmed", 3],
  ["Completed", 2],
  ["Rejected", 1],
  ["Cancelled", 1],
];

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomItem = <T>(items: T[]): T => {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("randomItem called with an empty array");
  return item;
};

const roundPrice = (value: number) => Math.round(value * 10) / 10;

const pickStatus = (): ReservationStatus => {
  const total = STATUS_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [status, weight] of STATUS_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return status;
  }
  return "Pending";
};

const daysFromNow = (days: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Inserts products for every store and reservations for every restaurant inside the caller's transaction.
export async function insertFakeData(
  client: PoolClient,
  { productsPerStore, reservationsPerRestaurant }: FakeDataOptions,
): Promise<FakeDataSummary> {
  const stores = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'STORE' ORDER BY id",
  );
  const restaurants = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'RESTAURANT' ORDER BY id",
  );

  const products: SeededProduct[] = [];
  for (const store of stores.rows) {
    const templates = [...PRODUCT_TEMPLATES].sort(() => 0.5 - Math.random()).slice(0, productsPerStore);
    for (const template of templates) {
      const originalPrice = roundPrice(template.price[0] + Math.random() * (template.price[1] - template.price[0]));
      const discountedPrice = roundPrice(originalPrice * (0.4 + Math.random() * 0.3));
      const quantity = randomInt(template.quantity[0], template.quantity[1]);
      const expiryDate = daysFromNow(randomInt(0, 14)).toISOString().slice(0, 10);

      const result = await client.query<{ id: number }>(
        `INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [store.id, template.name, template.description, template.category, originalPrice, discountedPrice, quantity, template.unit, expiryDate],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Product insert returned no row");
      products.push({
        id: row.id,
        storeId: store.id,
        name: template.name,
        unit: template.unit,
        quantity,
        price: discountedPrice,
        reserved: 0,
      });
    }
  }

  const counts: Record<ReservationStatus, number> = {
    Pending: 0,
    Confirmed: 0,
    Completed: 0,
    Rejected: 0,
    Cancelled: 0,
  };
  for (const restaurant of restaurants.rows) {
    for (let i = 0; i < reservationsPerRestaurant; i++) {
      const candidates = products.filter((p) => p.quantity - p.reserved >= 1);
      if (candidates.length === 0) break;

      const product = randomItem(candidates);
      const available = product.quantity - product.reserved;
      const quantity = Math.max(1, Math.min(available, Math.ceil(product.quantity * (0.1 + Math.random() * 0.2))));
      const status = pickStatus();
      const pickupDate = status === "Completed" ? daysFromNow(-randomInt(1, 5), 14) : daysFromNow(randomInt(1, 4), randomInt(8, 18));

      const reservation = await client.query(
        `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [product.id, restaurant.id, quantity, product.price, status, pickupDate.toISOString()],
      );
      const reservationId = reservation.rows[0].id;
      counts[status]++;

      // Pending and Confirmed reservations hold stock, matching the app's available-quantity rule.
      if (status === "Pending" || status === "Confirmed") {
        product.reserved += quantity;
      }

      // Same notifications the app sends for these events.
      if (status === "Pending") {
        await createNotification(client, {
          userId: product.storeId,
          type: "RESERVATION_CREATED",
          message: `New reservation request: ${quantity}${product.unit} ${product.name}`,
          reservationId,
          productId: product.id,
        });
      } else if (status === "Confirmed") {
        await createNotification(client, {
          userId: restaurant.id,
          type: "RESERVATION_ACCEPTED",
          message: `Your reservation for ${product.name} was accepted.`,
          reservationId,
          productId: product.id,
        });
      } else if (status === "Rejected") {
        await createNotification(client, {
          userId: restaurant.id,
          type: "RESERVATION_REJECTED",
          message: `Your reservation for ${product.name} was rejected.`,
          reservationId,
          productId: product.id,
        });
      }
    }
  }

  return {
    products: products.length,
    stores: stores.rows.length,
    restaurants: restaurants.rows.length,
    reservations: counts,
  };
}

export const printSummary = (summary: FakeDataSummary) => {
  const { Pending, Confirmed, Completed, Rejected, Cancelled } = summary.reservations;
  const total = Pending + Confirmed + Completed + Rejected + Cancelled;
  console.log(`Proizvodi: dodano ${summary.products} (prodavnice: ${summary.stores}).`);
  console.log(
    `Rezervacije: dodano ${total} (restorani: ${summary.restaurants}; ` +
      `Pending ${Pending}, Confirmed ${Confirmed}, Completed ${Completed}, Rejected ${Rejected}, Cancelled ${Cancelled}).`,
  );
};
