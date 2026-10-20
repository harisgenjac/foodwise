import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { createNotification } from "../utils/notifications.js";
import { isValidDateTime } from "../utils/dates.js";
import { parseId, parseNumber } from "../utils/params.js";

export const RESERVATION_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

export const createReservation = async (req: Request, res: Response) => {
  const { product_id, quantity, pickup_date } = req.body ?? {};
  const restaurant_id = req.user!.id;

  if (!product_id || quantity === undefined || quantity === null || quantity === "" || !pickup_date) {
    return res.status(400).json({ error: "Sva polja su obavezna." });
  }
  const productId = parseId(product_id);
  if (productId === null) {
    return res.status(404).json({ error: "Proizvod nije pronađen." });
  }
  const requestedQuantity = parseNumber(quantity);
  if (requestedQuantity === null || requestedQuantity <= 0) {
    return res.status(400).json({ error: "Količina mora biti broj veći od nule." });
  }
  if (!isValidDateTime(pickup_date)) {
    return res.status(400).json({ error: "Datum preuzimanja nije ispravan." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const products = await client.query(
      `SELECT *,
         expiry_date < CURRENT_DATE AS is_expired,
         $2::timestamp::date < CURRENT_DATE OR $2::timestamp::date > expiry_date AS pickup_out_of_range
       FROM products WHERE id = $1 FOR UPDATE`,
      [productId, pickup_date],
    );
    if (products.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }
    if (products.rows[0].status !== "Available" || products.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Proizvod više nije dostupan za rezervaciju." });
    }
    if (products.rows[0].pickup_out_of_range) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Datum preuzimanja mora biti između danas i roka trajanja proizvoda.",
      });
    }
    const reserved = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_reserved FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed')",
      [productId],
    );
    const availableQuantity =
      parseFloat(products.rows[0].quantity) -
      parseFloat(reserved.rows[0].total_reserved);
    if (availableQuantity < requestedQuantity) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Nema dovoljno proizvoda na raspolaganju." });
    }

    // unit_price keeps the price agreed at reservation time, even if the store edits the product later.
    const result = await client.query(
      "INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date) VALUES ($1, $2, $3, $4, 'Pending', $5) RETURNING *",
      [productId, restaurant_id, requestedQuantity, products.rows[0].discounted_price, pickup_date],
    );
    await createNotification(client, {
      userId: products.rows[0].store_id,
      type: "RESERVATION_CREATED",
      message: `New reservation request: ${requestedQuantity}${products.rows[0].unit} ${products.rows[0].name}`,
      reservationId: result.rows[0].id,
      productId: products.rows[0].id,
    });
    await client.query("COMMIT");
    return res.status(201).json({
      message: "Rezervacija uspješno kreirana.",
      reservation: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom kreiranja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom kreiranja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

export const getReservationById = async (req: Request, res: Response) => {
  try {
    const reservationId = parseId(req.params.id);
    const restorantId = req.user!.id;

    if (reservationId === null) {
      return res
        .status(404)
        .json({ error: "Ne postoji rezervacija sa tim ID" });
    }

    const result = await pool.query(
      `SELECT
    reservations.id,
    reservations.product_id,
    reservations.restaurant_id,
    reservations.quantity,
    reservations.status,
    reservations.pickup_date,
    reservations.created_at,
    reservations.updated_at,
    products.name AS product_name,
    products.description,
    reservations.unit_price AS discounted_price,
    products.original_price,
    products.category,
    products.unit,
    products.store_id,
    stores.business_name,
    stores.city,
    stores.address AS store_address,
    stores.phone AS store_phone,
    stores.pickup_hours AS store_pickup_hours,
    restaurants.business_name AS restaurant_name,
    restaurants.city AS restaurant_city,
    restaurants.address AS restaurant_address,
    restaurants.phone AS restaurant_phone
    FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users AS stores ON products.store_id = stores.id
    JOIN users AS restaurants ON reservations.restaurant_id = restaurants.id
    WHERE reservations.id = $1
    AND (reservations.restaurant_id = $2 OR products.store_id = $2)`,
      [reservationId, restorantId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Ne postoji rezervacija sa tim ID" });
    }
    return res.status(200).json({
      message: "Uspješno dohvačena rezervacija",
      reservation: result.rows[0],
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

export const getMineReservations = async (req: Request, res: Response) => {
  const restaurant_id = req.user!.id;
  const { status, name, business_name, store_id } = req.query;
  try {
    let query = `SELECT
    reservations.id,
    reservations.restaurant_id,
    reservations.quantity,
    reservations.status,
    reservations.pickup_date,
    reservations.created_at,
    reservations.updated_at,
    products.name AS product_name,
    products.description,
    reservations.unit_price AS discounted_price,
    products.original_price,
    products.category,
    products.unit,
    users.business_name,
    users.city
  FROM reservations
  JOIN products ON reservations.product_id = products.id
  JOIN users ON products.store_id = users.id
  WHERE reservations.restaurant_id = $1`;
    let values: (string | number)[] = [restaurant_id];

    if (status) {
      if (!RESERVATION_STATUSES.includes(status as string)) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(status as string);
      query += ` AND reservations.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    if (business_name) {
      values.push(`%${business_name}%` as string);
      query += ` AND users.business_name ILIKE $${values.length}`;
    }
    if (store_id) {
      const storeId = parseId(store_id);
      if (storeId === null) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(storeId);
      query += ` AND products.store_id = $${values.length}`;
    }

    query += ` ORDER BY
      CASE
        WHEN reservations.status = 'Pending' THEN 0
        WHEN reservations.status = 'Confirmed' THEN 1
        WHEN reservations.status = 'Completed' THEN 2
        WHEN reservations.status = 'Rejected' THEN 3
        WHEN reservations.status = 'Cancelled' THEN 4
      END,
      reservations.created_at DESC`;

    const result = await pool.query(query, values);
    return res.status(200).json({
      message: "Rezervacije uspješno dohvaćene.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

export const getStoreReservations = async (req: Request, res: Response) => {
  const store_id = req.user!.id;
  const { status, name, city } = req.query;
  try {
    let query = `SELECT
        reservations.id,
        reservations.restaurant_id,
        reservations.quantity,
        reservations.status,
        reservations.pickup_date,
        reservations.created_at,
        reservations.updated_at,
        products.name AS product_name,
        products.description,
        reservations.unit_price AS discounted_price,
        products.original_price,
        products.category,
        products.unit,
        users.business_name,
        users.city
      FROM reservations
      JOIN products ON reservations.product_id = products.id
      JOIN users ON reservations.restaurant_id = users.id
      WHERE products.store_id = $1`;
    let values: (string | number)[] = [store_id];

    if (status) {
      if (!RESERVATION_STATUSES.includes(status as string)) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(status as string);
      query += ` AND reservations.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    if (city) {
      values.push(`%${city}%` as string);
      query += ` AND users.city ILIKE $${values.length}`;
    }

    query += ` ORDER BY
      CASE WHEN reservations.status = 'Pending' THEN 0 ELSE 1 END,
      reservations.created_at DESC`;

    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Rezervacije uspješno dohvaćene.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

// Marks the product Sold once confirmed reservations cover its whole quantity.
// The caller's transaction must hold the lock on the product row.
export const markSoldIfFullyConfirmed = async (
  client: PoolClient,
  product: { id: number; store_id: number; name: string; quantity: string },
) => {
  const confirmedSum = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS total_confirmed FROM reservations WHERE product_id = $1 AND status = 'Confirmed'",
    [product.id],
  );
  if (parseFloat(confirmedSum.rows[0].total_confirmed) < parseFloat(product.quantity)) {
    return false;
  }
  await client.query("UPDATE products SET status = 'Sold' WHERE id = $1", [product.id]);
  await createNotification(client, {
    userId: product.store_id,
    type: "PRODUCT_SOLD_OUT",
    message: `${product.name} is sold out.`,
    productId: product.id,
  });
  return true;
};

export const acceptReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;

  if (reservationId === null) {
    return res.status(404).json({ error: "Rezervacija nije pronađena." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM reservations WHERE id = $1 FOR UPDATE",
      [reservationId],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    const productResult = await client.query(
      "SELECT *, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
      [result.rows[0].product_id],
    );

    if (productResult.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za prihvatanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }

    if (productResult.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "Rezervaciju nije moguće prihvatiti jer je proizvodu istekao rok trajanja.",
      });
    }

    await client.query(
      "UPDATE reservations SET status = 'Confirmed' WHERE id = $1",
      [reservationId],
    );
    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "RESERVATION_ACCEPTED",
      message: `Your reservation for ${productResult.rows[0].name} was accepted.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });

    await markSoldIfFullyConfirmed(client, productResult.rows[0]);

    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno prihvaćena." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom prihvatanja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom prihvatanja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

// Locks the reservation row, so a reject or cancel cannot interleave with an accept.
const lockReservation = (client: PoolClient, reservationId: number) =>
  client.query(
    `SELECT
       reservations.id,
       reservations.status,
       reservations.restaurant_id,
       reservations.product_id,
       products.name AS product_name,
       products.store_id
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.id = $1
     FOR UPDATE OF reservations`,
    [reservationId],
  );

export const rejectReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Rezervacija nije pronađena." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    if (result.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za odbijanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }
    await client.query(
      "UPDATE reservations SET status = 'Rejected' WHERE id = $1 AND status = 'Pending'",
      [reservationId],
    );
    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "RESERVATION_REJECTED",
      message: `Your reservation for ${result.rows[0].product_name} was rejected.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno odbijena." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom odbijanje rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom odbijanja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

export const cancelReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const restaurant_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Rezervacija nije pronađena." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    if (result.rows[0].restaurant_id !== restaurant_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za otkazivanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }

    await client.query(
      "UPDATE reservations SET status = 'Cancelled' WHERE id = $1 AND status = 'Pending'",
      [reservationId],
    );
    await createNotification(client, {
      userId: result.rows[0].store_id,
      type: "RESERVATION_CANCELLED",
      message: `A reservation for ${result.rows[0].product_name} was cancelled.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno otkazana." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom otkazivanja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom otkazivanja rezervacije." });
  } finally {
    if (client) client.release();
  }
};
