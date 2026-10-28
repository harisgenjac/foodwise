import pool from "../config/db.js";
import type { Request, Response } from 'express';
import { validateProductFields, type ProductFields } from '../utils/validateProduct.js';
import { parseId, parseNonNegativeInt } from '../utils/params.js';
import { parseProductCsv } from '../utils/productCsv.js';
import { CARD_PAGE_SIZE, listPage, parsePage } from '../utils/pagination.js';
import { HttpError } from '../utils/httpError.js';
import { cityDistance, parseCityFilter, parseRadius, userCityId } from '../utils/cities.js';
import { chargeForProduct, chargeForProducts, refundForProduct } from '../services/creditService.js';

export const PRODUCT_STATUSES = ["Available", "Sold", "Expired", "Removed"];

// Fixed SQL per allowed `sort` value; the query string never reaches the SQL text.
// Each ends with id DESC so equal values keep one order across pages.
const DISCOUNT = "(listed.original_price - listed.discounted_price) / listed.original_price";
const SORT_ORDERS: Record<string, string> = {
  // Nearest store first, then newest; no distance (a store's or a city-less
  // restaurant's request) sorts last.
  distance: "listed.distance_km ASC NULLS LAST, listed.created_at DESC, listed.id DESC",
  newest: "listed.created_at DESC, listed.id DESC",
  expiry: "listed.expiry_date ASC, listed.id DESC",
  price_asc: "listed.discounted_price ASC, listed.id DESC",
  price_desc: "listed.discounted_price DESC, listed.id DESC",
  discount_desc: `${DISCOUNT} DESC, listed.id DESC`,
  discount_asc: `${DISCOUNT} ASC, listed.id DESC`,
};

// A store's own list: grouped by status (Available first), then the chosen order.
const STATUS_GROUP = `CASE
        WHEN status = 'Available' THEN 0
        WHEN status = 'Sold' THEN 1
        WHEN status = 'Expired' THEN 2
        ELSE 3
      END`;
const MINE_SORT_ORDERS: Record<string, string> = {
  newest: `${STATUS_GROUP}, created_at DESC, id DESC`,
  expiry: `${STATUS_GROUP}, expiry_date ASC, id DESC`,
  price_asc: `${STATUS_GROUP}, discounted_price ASC, id DESC`,
  price_desc: `${STATUS_GROUP}, discounted_price DESC, id DESC`,
};

export const createProduct = async (req: Request, res: Response) => {
  let client;
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
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
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
    // Publishing costs 1 credit, charged in the same transaction: without credits the product
    // is rolled back and the store gets a 402.
    await chargeForProduct(client, store_id, { id: result.rows[0].id, category: result.rows[0].category });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Product created successfully.", product: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while creating product:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while creating the product." });
  } finally {
    if (client) client.release();
  }
};

// All or nothing: one invalid row rejects the whole file, so re-sending a fixed file never duplicates products.
// With ?dryRun=true the file is only checked: the same 400 for a bad file, else 200 with the
// product count, so the client can confirm the credits it will cost before importing.
export const importProducts = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "A CSV file is required." });
  }
  const parsed = parseProductCsv(req.file.buffer);
  if (parsed.error !== undefined) {
    return res.status(400).json({ error: parsed.error, rowErrors: parsed.rowErrors });
  }
  if (req.query.dryRun === "true") {
    return res.status(200).json({ message: "The file is valid.", count: parsed.products.length });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const products = [];
    for (const product of parsed.products) {
      const result = await client.query(
        "INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
        [
          req.user!.id,
          product.name.trim(),
          product.description ?? null,
          product.category,
          product.original_price,
          product.discounted_price,
          product.quantity,
          product.unit,
          product.expiry_date,
        ],
      );
      products.push(result.rows[0]);
    }
    // One credit per product, all or nothing like the import itself: with fewer credits than
    // rows nothing is imported (402).
    await chargeForProducts(
      client,
      req.user!.id,
      products.map((product) => ({ id: product.id, category: product.category })),
    );
    await client.query("COMMIT");
    return res.status(201).json({
      message: `Products imported: ${products.length}.`,
      products,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while importing products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while importing products." });
  } finally {
    if (client) client.release();
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, expiryWithinDays, name, city_id, sort, store_id } = req.query;
    const radiusFilter = parseRadius(req.query.radius);
    if ("invalid" in radiusFilter) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    // Distances start at a restaurant's city; a store browsing gets none.
    const fromCity = req.user!.role === "RESTAURANT" ? await userCityId(pool, req.user!.id) : null;
    let values: (string | number | null)[] = [fromCity];

    // Inner query: marketplace products with their remaining quantity and distance; the outer
    // queries drop fully reserved ones, apply the radius, count the rest and return one page.
    let query = `
      SELECT
        products.*,
        users.business_name,
        cities.name AS city,
        ${cityDistance("$1::integer", "users.city_id")} AS distance_km,
        products.quantity - COALESCE(
          (SELECT SUM(quantity) FROM reservations
           WHERE reservations.product_id = products.id
           AND reservations.status IN ('Pending', 'Confirmed', 'Completed')),
          0
        ) AS available_quantity,
        products.expiry_date - CURRENT_DATE AS days_until_expiry
      FROM products
      JOIN users ON products.store_id = users.id
      LEFT JOIN cities ON cities.id = users.city_id
      WHERE products.status = 'Available'
      AND products.expiry_date >= CURRENT_DATE
      AND users.is_blocked = false
      AND users.business_name IS NOT NULL
    `;

    if (category) {
      values.push(category as string);
      query += ` AND products.category = $${values.length}`;
    }

    if (expiryWithinDays) {
      const days = parseNonNegativeInt(expiryWithinDays);
      if (days === null) {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(days);
      query += ` AND products.expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%`);
      query += ` AND products.name ILIKE $${values.length}`;
    }

    // The store's city, from the cities list like the store list's city filter.
    const cityFilter = await parseCityFilter(pool, city_id);
    if ("invalid" in cityFilter) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    if (cityFilter.cityId !== null) {
      values.push(cityFilter.cityId);
      query += ` AND users.city_id = $${values.length}`;
    }

    // A store's profile lists its offers through the marketplace, with the same rules.
    if (store_id) {
      const storeId = parseId(store_id);
      if (storeId === null) {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(storeId);
      query += ` AND products.store_id = $${values.length}`;
    }

    const page = parsePage(req.query, CARD_PAGE_SIZE);
    const sortKey = sort ?? "newest";
    if (!page || typeof sortKey !== "string" || !Object.hasOwn(SORT_ORDERS, sortKey)) {
      return res.status(400).json({ error: "Invalid filter." });
    }

    // The radius limits a restaurant's search unless it chose a city or a store itself.
    const radius =
      fromCity !== null && cityFilter.cityId === null && !store_id ? radiusFilter.radius : null;
    const listed = `FROM (${query}) AS listed WHERE listed.available_quantity > 0`;
    let from = listed;
    let outsideRadiusCount = 0;
    if (radius !== null) {
      values.push(radius);
      from += ` AND listed.distance_km <= $${values.length}`;
      const outside = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count ${listed} AND listed.distance_km > $${values.length}`,
        values,
      );
      outsideRadiusCount = Number(outside.rows[0]!.count);
    }

    const { rows, total } = await listPage("listed.*", from, SORT_ORDERS[sortKey]!, values, page);

    return res.status(200).json({ products: rows, total, outside_radius_count: outsideRadiusCount });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products." });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.id);
    if (productId === null) {
      return res.status(404).json({ error: "Product not found." });
    }

    const result = await pool.query(
      `SELECT
    products.*,
    users.business_name,
    cities.name AS city,
    users.address AS store_address,
    users.phone AS store_phone,
    users.pickup_hours AS store_pickup_hours,
    products.quantity - COALESCE(
      (SELECT SUM(quantity) FROM reservations
       WHERE reservations.product_id = products.id
       AND reservations.status IN ('Pending', 'Confirmed', 'Completed')),
      0
    ) AS available_quantity,
     products.expiry_date - CURRENT_DATE AS days_until_expiry
   FROM products
   JOIN users ON products.store_id = users.id
   LEFT JOIN cities ON cities.id = users.city_id
   WHERE products.id = $1 AND users.is_blocked = false`,
      [productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }
    return res.status(200).json({ product: result.rows[0] });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products." });
  }
};

export const getMineProducts = async (req: Request, res: Response) => {
  try {
    const store_id = req.user!.id;
    const { status, category, name, expiryWithinDays, sort } = req.query;
    const page = parsePage(req.query, CARD_PAGE_SIZE);
    const sortKey = sort ?? "newest";
    if (!page || typeof sortKey !== "string" || !Object.hasOwn(MINE_SORT_ORDERS, sortKey)) {
      return res.status(400).json({ error: "Invalid filter." });
    }

    let query = "FROM products WHERE store_id = $1 AND status != 'Removed'";
    let values: (string | number)[] = [store_id];

    if (category) {
      values.push(category as string);
      query += ` AND category = $${values.length}`;
    }

    if (status) {
      if (!PRODUCT_STATUSES.includes(status as string)) {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(status as string);
      query += ` AND status = $${values.length}`;
    }

    if (expiryWithinDays) {
      const days = parseNonNegativeInt(expiryWithinDays);
      if (days === null) {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(days);
      query += ` AND expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND name ILIKE $${values.length}`;
    }

    const { rows, total } = await listPage(
      "*",
      query,
      MINE_SORT_ORDERS[sortKey]!,
      values,
      page,
    );
    return res.status(200).json({ products: rows, total });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products." });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
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

    // The lock keeps the edit from interleaving with reservations created or accepted meanwhile.
    const existing = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }

    if (existing.rows[0].store_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to edit this product." });
    }

    if (existing.rows[0].status !== "Available") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only available products can be edited." });
    }

    // The store paid a credit to publish this quantity and expiry date, so both are locked: a
    // different offer needs a new product (and a new credit). Everything else stays editable.
    // The form still sends both, so they are compared instead of being left out.
    if (
      parseFloat(quantity) !== parseFloat(existing.rows[0].quantity) ||
      expiry_date !== existing.rows[0].expiry_date
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Quantity and expiry date cannot be changed after publishing.",
      });
    }

    const result = await client.query(
      `UPDATE products
       SET name = $1, description = $2, category = $3, original_price = $4,
           discounted_price = $5, unit = $6
       WHERE id = $7
       RETURNING *`,
      [
        name.trim(),
        description,
        category,
        original_price,
        discounted_price,
        unit,
        productId,
      ],
    );

    await client.query("COMMIT");
    return res.status(200).json({
      message: "Product updated successfully.",
      product: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while updating product:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while updating the product." });
  } finally {
    if (client) client.release();
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // The lock keeps a reservation from being created between the checks and the delete, so a
    // product with an active reservation can never be removed through this route.
    const existing = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [
      productId,
    ]);
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }

    if (existing.rows[0].store_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to delete this product." });
    }
    const activeReservations = await client.query(
      "SELECT id FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed')",
      [productId],
    );

    if (activeReservations.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Product has active reservations and cannot be deleted.",
      });
    }
    if (["Sold", "Expired", "Removed"].includes(existing.rows[0].status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Product cannot be deleted because it is sold or expired.",
      });
    }
    const result = await client.query(
      "UPDATE products SET status = 'Removed' WHERE id = $1 RETURNING *",
      [productId],
    );
    // Refunded only on the credit day of the charge and only if nothing was reserved (a
    // picked-up reservation counts); otherwise the credit stays spent.
    const refund = await refundForProduct(client, productId, { actor: "USER", userId: req.user!.id });
    await client.query("COMMIT");
    return res.status(200).json({
      message: "Product deleted successfully.",
      product: result.rows[0],
      creditRefunded: refund.refunded,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while deleting product:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting the product." });
  } finally {
    if (client) client.release();
  }
};
