import pool from "../config/db.js";
import type { Request, Response } from 'express';
import { validateProductFields, type ProductFields } from '../utils/validateProduct.js';
import { parseId, parseNonNegativeInt, parseNumber } from '../utils/params.js';
import { markSoldIfFullyConfirmed } from './reservations.controller.js';

export const PRODUCT_STATUSES = ["Available", "Sold", "Expired", "Removed"];

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      category,
      original_price,
      discounted_price,
      quantity,
      unit,
      expiry_date,
    }: ProductFields = req.body ?? {};
    const store_id = req.user!.id;
    const validationError = validateProductFields(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const result = await pool.query(
      "INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
      [
        store_id,
        name.trim(),
        description,
        category,
        original_price,
        discounted_price,
        quantity,
        unit,
        expiry_date,
      ],
    );
    return res
      .status(201)
      .json({ message: "Proizvod uspješno dodan.", product: result.rows[0] });
  } catch (error) {
    console.error("Greška prilikom kreiranja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom kreiranja proizvoda." });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, maxPrice, expiryWithinDays, name, limit, offset } = req.query;

    // Inner query: marketplace products with their remaining quantity; the outer queries
    // drop fully reserved ones, count the rest and return one page.
    let query = `
      SELECT
        products.*,
        users.business_name,
        users.city,
        products.quantity - COALESCE(
          (SELECT SUM(quantity) FROM reservations
           WHERE reservations.product_id = products.id
           AND reservations.status IN ('Pending', 'Confirmed')),
          0
        ) AS available_quantity,
        products.expiry_date - CURRENT_DATE AS days_until_expiry
      FROM products
      JOIN users ON products.store_id = users.id
      WHERE products.status = 'Available'
      AND products.expiry_date >= CURRENT_DATE
    `;
    let values: (string | number)[] = [];

    if (category) {
      values.push(category as string);
      query += ` AND products.category = $${values.length}`;
    }

    if (maxPrice) {
      const price = parseNumber(maxPrice);
      if (price === null || price < 0) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(price);
      query += ` AND products.discounted_price <= $${values.length}`;
    }

    if (expiryWithinDays) {
      const days = parseNonNegativeInt(expiryWithinDays);
      if (days === null) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(days);
      query += ` AND products.expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%`);
      query += ` AND products.name ILIKE $${values.length}`;
    }

    const pageSize = limit === undefined ? DEFAULT_PAGE_SIZE : parseNonNegativeInt(limit);
    const skip = offset === undefined ? 0 : parseNonNegativeInt(offset);
    if (pageSize === null || pageSize === 0 || pageSize > MAX_PAGE_SIZE || skip === null) {
      return res.status(400).json({ error: "Neispravan filter." });
    }

    const filtered = `FROM (${query}) AS listed WHERE listed.available_quantity > 0`;
    const total = await pool.query(`SELECT COUNT(*) AS total ${filtered}`, values);
    const result = await pool.query(
      `SELECT listed.* ${filtered}
       ORDER BY listed.created_at DESC, listed.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, skip],
    );

    return res
      .status(200)
      .json({ products: result.rows, total: parseInt(total.rows[0].total, 10) });
  } catch (error) {
    console.error("Greška prilikom dohvatanja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja proizvoda." });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.id);
    if (productId === null) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    const result = await pool.query(
      `SELECT
    products.*,
    users.business_name,
    users.city,
    users.address AS store_address,
    users.phone AS store_phone,
    users.pickup_hours AS store_pickup_hours,
    products.quantity - COALESCE(
      (SELECT SUM(quantity) FROM reservations
       WHERE reservations.product_id = products.id
       AND reservations.status IN ('Pending', 'Confirmed')),
      0
    ) AS available_quantity,
     products.expiry_date - CURRENT_DATE AS days_until_expiry
   FROM products
   JOIN users ON products.store_id = users.id
   WHERE products.id = $1`,
      [productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }
    return res.status(200).json({ product: result.rows[0] });
  } catch (error) {
    console.error("Greška prilikom dohvatanja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja proizvoda." });
  }
};

export const getMineProducts = async (req: Request, res: Response) => {
  try {
    const store_id = req.user!.id;
    const { status, category, name, expiryWithinDays } = req.query;

    let query =
      "SELECT * FROM products WHERE store_id = $1 AND status != 'Removed'";
    let values: (string | number)[] = [store_id];

    if (category) {
      values.push(category as string);
      query += ` AND category = $${values.length}`;
    }

    if (status) {
      if (!PRODUCT_STATUSES.includes(status as string)) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(status as string);
      query += ` AND status = $${values.length}`;
    }

    if (expiryWithinDays) {
      const days = parseNonNegativeInt(expiryWithinDays);
      if (days === null) {
        return res.status(400).json({ error: "Neispravan filter." });
      }
      values.push(days);
      query += ` AND expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND name ILIKE $${values.length}`;
    }

    query += ` ORDER BY
  CASE
    WHEN status = 'Available' THEN 0
    WHEN status = 'Sold' THEN 1
    WHEN status = 'Expired' THEN 2
    ELSE 3
  END,
  created_at DESC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ products: result.rows });
  } catch (error) {
    console.error("Greška prilikom dohvatanja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja proizvoda." });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Proizvod nije pronađen." });
  }
  const {
    name,
    description,
    category,
    original_price,
    discounted_price,
    quantity,
    unit,
    expiry_date,
  }: ProductFields = req.body ?? {};
  const validationError = validateProductFields(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // The lock keeps reservations from being created or accepted while the quantity changes.
    const existing = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    if (existing.rows[0].store_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Nemate dozvolu za izmjenu ovog proizvoda." });
    }

    if (existing.rows[0].status !== "Available") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Samo dostupni proizvodi se mogu mijenjati." });
    }

    const reserved = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_reserved FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed')",
      [productId],
    );
    if (parseFloat(quantity) < parseFloat(reserved.rows[0].total_reserved)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Količina ne može biti manja od već rezervisane količine.",
      });
    }

    const result = await client.query(
      `UPDATE products
       SET name = $1, description = $2, category = $3, original_price = $4,
           discounted_price = $5, quantity = $6, unit = $7, expiry_date = $8
       WHERE id = $9
       RETURNING *`,
      [
        name.trim(),
        description,
        category,
        original_price,
        discounted_price,
        quantity,
        unit,
        expiry_date,
        productId,
      ],
    );

    // Lowering the quantity to what is already confirmed sells the product out.
    let product = result.rows[0];
    if (await markSoldIfFullyConfirmed(client, product)) {
      product = (await client.query("SELECT * FROM products WHERE id = $1", [productId])).rows[0];
    }

    await client.query("COMMIT");
    return res.status(200).json({
      message: "Proizvod uspješno ažuriran.",
      product,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom ažuriranja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom ažuriranja proizvoda." });
  } finally {
    if (client) client.release();
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.id);
    if (productId === null) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    const existing = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    if (existing.rows[0].store_id !== req.user!.id) {
      return res
        .status(403)
        .json({ error: "Nemate dozvolu za brisanje ovog proizvoda." });
    }
    const activeReservations = await pool.query(
      "SELECT id FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed')",
      [productId],
    );

    if (activeReservations.rows.length > 0) {
      return res.status(400).json({
        error: "Proizvod ima aktivne rezervacije i ne može biti obrisan.",
      });
    }
    if (["Sold", "Expired", "Removed"].includes(existing.rows[0].status)) {
      return res.status(400).json({
        error: "Proizvod ne može biti obrisan jer je prodat ili istekao.",
      });
    }
    const result = await pool.query(
      "UPDATE products SET status = 'Removed' WHERE id = $1 RETURNING *",
      [productId],
    );
    return res.status(200).json({
      message: "Proizvod uspješno obrisan.",
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Greška prilikom brisanja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom brisanja proizvoda." });
  }
};
