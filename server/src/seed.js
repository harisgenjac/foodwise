import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from './config/db.js';

const STORES = [
  { first_name: 'Amir', last_name: 'Hodžić', email: 'market.centar@demo.com', business_name: 'Market Centar', city: 'Sarajevo', phone: '061111111', address: 'Ferhadija 5' },
  { first_name: 'Selma', last_name: 'Begić', email: 'pekara.dobra@demo.com', business_name: 'Pekara Dobra', city: 'Tuzla', phone: '061222222', address: 'Slatina 12' },
  { first_name: 'Emir', last_name: 'Kovač', email: 'zeleni.market@demo.com', business_name: 'Zeleni Market', city: 'Mostar', phone: '061333333', address: 'Bulevar 3' },
];

const RESTAURANTS = [
  { first_name: 'Lejla', last_name: 'Softić', email: 'restoran.ukus@demo.com', business_name: 'Restoran Ukus', city: 'Sarajevo', phone: '062111111', address: 'Titova 20' },
  { first_name: 'Adnan', last_name: 'Mešić', email: 'pizzeria.roma@demo.com', business_name: 'Pizzeria Roma', city: 'Tuzla', phone: '062222222', address: 'Trg 7' },
];

const PRODUCT_TEMPLATES = [
  { name: 'Pileći batak', category: 'Meat', original_price: 12, discounted_price: 6, quantity: 15, unit: 'kg', daysUntilExpiry: 2, description: 'Svježi pileći bataci, čuvani na hladnom.' },
  { name: 'Mlijeko 3.2%', category: 'Dairy', original_price: 2.5, discounted_price: 1.2, quantity: 40, unit: 'kom', daysUntilExpiry: 1, description: 'Pasterizovano mlijeko, kutija 1L.' },
  { name: 'Paradajz', category: 'Vegetables', original_price: 4, discounted_price: 2, quantity: 25, unit: 'kg', daysUntilExpiry: 3, description: 'Domaći paradajz, blago prezreo za dužu upotrebu.' },
  { name: 'Jabuke Idared', category: 'Fruits', original_price: 3, discounted_price: 1.5, quantity: 30, unit: 'kg', daysUntilExpiry: 5, description: 'Jabuke sa lokalnog voćnjaka.' },
  { name: 'Hljeb bijeli', category: 'Bakery', original_price: 2, discounted_price: 0.8, quantity: 20, unit: 'kom', daysUntilExpiry: 1, description: 'Svježe pečen hljeb, dan star.' },
  { name: 'Sok od narandže', category: 'Drinks', original_price: 3.5, discounted_price: 1.8, quantity: 18, unit: 'kom', daysUntilExpiry: 10, description: '100% prirodni sok, 1L.' },
  { name: 'Smrznuto povrće mix', category: 'Frozen Food', original_price: 5, discounted_price: 2.5, quantity: 12, unit: 'kg', daysUntilExpiry: 30, description: 'Mješavina povrća za variva.' },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Brisanje postojećih podataka...');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM reservations');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM users');

    const passwordHash = await bcrypt.hash('demo12345', 10);

    console.log('Kreiranje store korisnika i proizvoda...');
    const storeIds = [];
    for (const store of STORES) {
      const result = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city, phone, address)
         VALUES ($1, $2, $3, $4, 'STORE', $5, $6, $7, $8) RETURNING id`,
        [store.first_name, store.last_name, store.email, passwordHash, store.business_name, store.city, store.phone, store.address]
      );
      storeIds.push(result.rows[0].id);
    }

    const productIds = [];
    for (const storeId of storeIds) {
      const shuffled = [...PRODUCT_TEMPLATES].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 5);

      for (const p of selected) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + p.daysUntilExpiry);

        const result = await client.query(
          `INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [storeId, p.name, p.description, p.category, p.original_price, p.discounted_price, p.quantity, p.unit, expiryDate.toISOString().slice(0, 10)]
        );
        productIds.push({ id: result.rows[0].id, quantity: p.quantity });
      }
    }

    console.log('Kreiranje restaurant korisnika...');
    const restaurantIds = [];
    for (const restaurant of RESTAURANTS) {
      const result = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city, phone, address)
         VALUES ($1, $2, $3, $4, 'RESTAURANT', $5, $6, $7, $8) RETURNING id`,
        [restaurant.first_name, restaurant.last_name, restaurant.email, passwordHash, restaurant.business_name, restaurant.city, restaurant.phone, restaurant.address]
      );
      restaurantIds.push(result.rows[0].id);
    }

    console.log('Kreiranje rezervacija...');
    const statuses = ['Pending', 'Confirmed', 'Cancelled'];
    const reservationCount = Math.min(6, productIds.length);

    for (let i = 0; i < reservationCount; i++) {
      const product = productIds[i];
      const restaurantId = restaurantIds[i % restaurantIds.length];
      const status = statuses[i % statuses.length];
      const pickupDate = new Date();
      pickupDate.setDate(pickupDate.getDate() + 1);

      const reservedQty = Math.max(1, Math.floor(product.quantity * 0.2));

      await client.query(
        `INSERT INTO reservations (product_id, restaurant_id, quantity, status, pickup_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [product.id, restaurantId, reservedQty, status, pickupDate.toISOString()]
      );
    }

    console.log('\n✅ Demo podaci uspješno kreirani!\n');
    console.log('Store nalozi (lozinka za sve: demo12345):');
    STORES.forEach(s => console.log(`  - ${s.email} (${s.business_name})`));
    console.log('\nRestaurant nalozi (lozinka za sve: demo12345):');
    RESTAURANTS.forEach(r => console.log(`  - ${r.email} (${r.business_name})`));

  } catch (error) {
    console.error('Greška prilikom seed-ovanja:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();