import pool from "../config/db.js";
import type { PoolClient } from "pg";
import type { Request } from "express";
import { parseId } from "../utils/params.js";
import { CARD_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { parseCityFilter } from "../utils/cities.js";

// Item-level (reservation row) reads still used by the admin reservations, the headquarters'
// branch page and the reports until orders PR 4 moves them to orders. The restaurant's and
// store's own screens use /api/orders.

export const RESERVATION_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

// The items on a store's products, shown read-only to its company's headquarters (GET /company/branches/:id/reservations). Null for an invalid filter or page.
export const listStoreReservations = async (storeId: number, query: Request["query"]) => {
  const { status, name, city_id } = query;
  const page = parsePage(query, CARD_PAGE_SIZE);
  if (!page) {
    return null;
  }
  const columns = `
      reservations.id,
      reservations.restaurant_id,
      reservations.quantity,
      reservations.status,
      reservations.pickup_date,
      reservations.picked_up_at,
      reservations.created_at,
      reservations.updated_at,
      reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
      products.name AS product_name,
      products.description,
      reservations.unit_price AS discounted_price,
      products.original_price,
      products.category,
      products.unit,
      users.business_name,
      cities.name AS city`;
  let from = `FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users ON reservations.restaurant_id = users.id
    LEFT JOIN cities ON cities.id = users.city_id
    WHERE products.store_id = $1`;
  const values: (string | number)[] = [storeId];

  if (status) {
    if (!RESERVATION_STATUSES.includes(status as string)) {
      return null;
    }
    values.push(status as string);
    from += ` AND reservations.status = $${values.length}`;
  }
  if (name) {
    values.push(`%${name}%` as string);
    from += ` AND products.name ILIKE $${values.length}`;
  }
  // The restaurant's city.
  const cityFilter = await parseCityFilter(pool, city_id);
  if ("invalid" in cityFilter) {
    return null;
  }
  if (cityFilter.cityId !== null) {
    values.push(cityFilter.cityId);
    from += ` AND users.city_id = $${values.length}`;
  }

  const { rows, total } = await listPage(
    columns,
    from,
    `CASE WHEN reservations.status = 'Pending' THEN 0 ELSE 1 END,
    reservations.created_at DESC, reservations.id DESC`,
    values,
    page,
  );
  return { reservations: rows, total };
};

// An item with its order, owners and state (no lock: the order service locks and checks again).
// A pickup is overdue once its whole day has passed (the pickup time on the same day does not count).
export const findReservation = async (db: Pick<PoolClient, "query">, reservationId: number) => {
  const result = await db.query(
    `SELECT
       reservations.id,
       reservations.order_id,
       reservations.status,
       reservations.restaurant_id,
       reservations.product_id,
       reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
       products.name AS product_name,
       products.store_id,
       products.expiry_date < CURRENT_DATE AS is_expired
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.id = $1`,
    [reservationId],
  );
  return result.rows[0] ?? null;
};

// Items belong to the caller through the product (store) or the item (restaurant); `parties`
// is the other side of the handover (the reports join it).
export const pickupOwnership = (role: string) =>
  role === "STORE"
    ? { owner: "products.store_id = $1", partyJoin: "reservations.restaurant_id = parties.id" }
    : { owner: "reservations.restaurant_id = $1", partyJoin: "products.store_id = parties.id" };
