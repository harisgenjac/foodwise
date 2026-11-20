import pool from "../config/db.js";
import type { Pool, PoolClient } from "pg";

interface SavedTotals {
  kg: number;
  l: number;
  pieces: number;
  value: number;
  savings: number;
}

// Kilograms of CO₂ avoided per kilogram of food saved (producing it and throwing it away).
// An estimate taken from general food-waste figures, not a measured value for our products:
// verify the source and the number before launch.
export const CO2_KG_PER_FOOD_KG = 2.5;

// Food saved, platform-wide, one restaurant's (`restaurantId`: what it picked up) or one store's
// (`storeId`: what restaurants picked up from it), shared by the admin statistics and the home
// pages' stats. Picked-up (Completed) order items only, g/kg as kg, ml/l as l, kom and pak as
// pieces. Value (the agreed prices × quantities) and savings follow the impact report.
export const getSavedTotals = async (
  db: Pool | PoolClient = pool,
  { restaurantId, storeId }: { restaurantId?: number; storeId?: number } = {},
): Promise<SavedTotals> => {
  const result = await db.query<Record<keyof SavedTotals, string>>(
    `SELECT
       COALESCE(SUM(CASE products.unit
         WHEN 'kg' THEN order_items.quantity
         WHEN 'g' THEN order_items.quantity / 1000 END), 0) AS kg,
       COALESCE(SUM(CASE products.unit
         WHEN 'l' THEN order_items.quantity
         WHEN 'ml' THEN order_items.quantity / 1000 END), 0) AS l,
       COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN order_items.quantity END), 0) AS pieces,
       COALESCE(ROUND(SUM(order_items.unit_price * order_items.quantity), 2), 0) AS value,
       COALESCE(ROUND(SUM(GREATEST(products.original_price - order_items.unit_price, 0) * order_items.quantity), 2), 0) AS savings
     FROM order_items
     JOIN products ON order_items.product_id = products.id
     WHERE order_items.status = 'Completed'
       AND ($1::integer IS NULL OR order_items.restaurant_id = $1)
       AND ($2::integer IS NULL OR products.store_id = $2)`,
    [restaurantId ?? null, storeId ?? null],
  );
  const row = result.rows[0]!;
  return {
    kg: Number(row.kg),
    l: Number(row.l),
    pieces: Number(row.pieces),
    value: Number(row.value),
    savings: Number(row.savings),
  };
};

export interface RestaurantImpact {
  food_kg: number;
  co2_kg: number;
  savings: number;
}

// The restaurant home page's stats: food saved (kg + l, a litre counted as a kilogram; pieces left
// out), the CO₂ estimate and the savings, over the restaurant's own picked-up items since it joined.
// A restaurant that has picked up nothing yet gets zeros.
export const getRestaurantImpact = async (restaurantId: number): Promise<RestaurantImpact> => {
  const totals = await getSavedTotals(pool, { restaurantId });
  const food = totals.kg + totals.l;
  return {
    food_kg: food,
    co2_kg: food * CO2_KG_PER_FOOD_KG,
    savings: totals.savings,
  };
};

export interface StoreImpact {
  food_kg: number;
  co2_kg: number;
  revenue: number;
}

// The store home page's stats, over what restaurants picked up from the store since it joined:
// food saved and CO₂ as for a restaurant, and "back in the till" (`revenue`), the agreed prices ×
// quantities of those items. A store with no pickups yet gets zeros.
export const getStoreImpact = async (storeId: number): Promise<StoreImpact> => {
  const totals = await getSavedTotals(pool, { storeId });
  const food = totals.kg + totals.l;
  return {
    food_kg: food,
    co2_kg: food * CO2_KG_PER_FOOD_KG,
    revenue: totals.value,
  };
};
