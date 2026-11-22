import pool from "../config/db.js";
import type { Pool, PoolClient } from "pg";
import { companyName, storeLogo } from "../utils/branding.js";
import { businessDistance, pinDistance } from "../utils/location.js";
import { availableQuantity, onOffer } from "./stock.js";

// The restaurant home page's offer rows: how many stores, and how many offers each.
export const HOME_STORES = 3;
export const HOME_PRODUCTS_PER_STORE = 4;

// The stores for the restaurant's home page: its favourite stores first, then the nearest other
// stores, only stores restaurants can see that have at least one offer right now (onOffer), at most
// HOME_STORES. "Nearest" is the distance between the two map pins, or between the two cities when
// either has no pin; ties (and stores without any distance, last) by id. Each store comes with its
// offer count and its HOME_PRODUCTS_PER_STORE offers that expire soonest (marketplace rows).
export const getHomeOffers = async (restaurantId: number, db: Pool | PoolClient = pool) => {
  const stores = await db.query<{
    id: number;
    business_name: string;
    logo_url: string | null;
    company_name: string | null;
    city: string | null;
    distance_km: number | null;
    offer_count: number;
    is_favorite: boolean;
  }>(
    `WITH me AS (
       SELECT users.city_id, users.latitude, users.longitude FROM users WHERE users.id = $1
     ),
     offers AS (
       SELECT products.store_id, COUNT(*)::int AS offer_count
       FROM products
       JOIN users ON users.id = products.store_id
       WHERE ${onOffer("products", "users")}
       GROUP BY products.store_id
     )
     SELECT users.id, users.business_name, ${storeLogo("users")} AS logo_url,
            ${companyName("users")} AS company_name, cities.name AS city,
            (${pinDistance("me", "users")})::float AS distance_km, offers.offer_count,
            EXISTS (
              SELECT 1 FROM favorites WHERE favorites.restaurant_id = $1 AND favorites.store_id = users.id
            ) AS is_favorite
     FROM offers
     JOIN users ON users.id = offers.store_id
     LEFT JOIN cities ON cities.id = users.city_id
     CROSS JOIN me
     ORDER BY is_favorite DESC,
              ${businessDistance("me", "users")} ASC NULLS LAST,
              users.id ASC
     LIMIT $2`,
    [restaurantId, HOME_STORES],
  );
  const storeIds = stores.rows.map((store) => store.id);
  if (storeIds.length === 0) return [];

  const products = await db.query<{ store_id: number } & Record<string, unknown>>(
    `SELECT ranked.* FROM (
       SELECT products.*, users.business_name, ${companyName("users")} AS company_name, cities.name AS city,
              ${availableQuantity("products")} AS available_quantity,
              products.expiry_date - CURRENT_DATE AS days_until_expiry,
              ROW_NUMBER() OVER (
                PARTITION BY products.store_id ORDER BY products.expiry_date ASC, products.id ASC
              ) AS rank_in_store
       FROM products
       JOIN users ON users.id = products.store_id
       LEFT JOIN cities ON cities.id = users.city_id
       WHERE products.store_id = ANY($1::int[]) AND ${onOffer("products", "users")}
     ) AS ranked
     WHERE ranked.rank_in_store <= $2
     ORDER BY ranked.rank_in_store`,
    [storeIds, HOME_PRODUCTS_PER_STORE],
  );
  // The shop's shortage is the store's own business.
  const rows = products.rows.map(({ shop_shortage: _shortage, rank_in_store: _rank, ...product }) => product);

  return stores.rows.map((store) => ({
    ...store,
    products: rows.filter((product) => product.store_id === store.id),
  }));
};
