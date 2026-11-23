import pool from "../config/db.js";
import type { Request, Response } from 'express';
import { validateProductFields, type ProductFields } from '../utils/validateProduct.js';
import { parseId, parseNonNegativeInt } from '../utils/params.js';
import { parseProductCsv } from '../utils/productCsv.js';
import { CARD_PAGE_SIZE, listPage, parsePage } from '../utils/pagination.js';
import { sendError } from '../utils/httpError.js';
import { cityDistance, parseCityFilter, parseRadius, userCityId } from '../utils/cities.js';
import { chargeForProduct, chargeForProducts, refundForProduct } from '../services/creditService.js';
import { visibleStore } from '../utils/visibility.js';
import { companyName, storeLogo } from '../utils/branding.js';
import { availableQuantity, pendingHeld, soldInShop } from '../services/stock.js';
import { saveImage } from '../services/storage.js';
import { parseProductImage, productImageNamePrefix, releaseProductImage } from '../utils/productImages.js';
import { pauseColumns } from '../utils/orderSettings.js';
import { getHomeOffers } from '../services/homeOffers.js';
import { openStateAt, type Schedule } from '../utils/schedule.js';

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
    const image = await parseProductImage(req.body?.image_url, store_id);
    if (image && "error" in image) {
      return res.status(400).json({ error: image.error });
    }
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
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
        image?.value ?? null,
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
    return sendError(res, error, "An error occurred while creating the product.", "Error while creating product:");
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
    return sendError(res, error, "An error occurred while importing products.", "Error while importing products:");
  } finally {
    if (client) client.release();
  }
};

// Uploads a product or template image before the form is saved; the form then sends the
// returned image_url. A file no product or template takes up is deleted by the daily cleanup.
export const uploadProductImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image was uploaded." });
    }
    const imageUrl = await saveImage("products", req.file, productImageNamePrefix(req.user!.id));
    return res.status(201).json({ message: "Image uploaded successfully.", image_url: imageUrl });
  } catch (error) {
    console.error("Error while uploading image:", error);
    return res.status(500).json({ error: "An error occurred while uploading the image." });
  }
};

// The marketplace's filters, shared by GET /products (a list of products) and GET /products/by-store
// (Search: the matches grouped by store). Returns the FROM clause over `listed` (products on offer
// with their remaining quantity and distance, the filters and the radius applied), its values, how
// many offers the radius hides and the sort key; null for an invalid filter.
const buildMarketplace = async (req: Request) => {
  const { category, expiryWithinDays, name, city_id, sort, store_id } = req.query;
  const radiusFilter = parseRadius(req.query.radius);
  if ("invalid" in radiusFilter) return null;
  // Distances start at a restaurant's city; a store browsing gets none.
  const fromCity = req.user!.role === "RESTAURANT" ? await userCityId(pool, req.user!.id) : null;
  const values: (string | number | null)[] = [fromCity];

  // Inner query: marketplace products with their remaining quantity and distance; the outer
  // queries drop fully ordered ones, apply the radius, count the rest and return one page.
  let query = `
      SELECT
        products.*,
        users.business_name,
        ${companyName("users")} AS company_name,
        cities.name AS city,
        ${cityDistance("$1::integer", "users.city_id")} AS distance_km,
        ${availableQuantity("products")} AS available_quantity,
        products.expiry_date - CURRENT_DATE AS days_until_expiry
      FROM products
      JOIN users ON products.store_id = users.id
      LEFT JOIN cities ON cities.id = users.city_id
      WHERE products.status = 'Available'
      AND products.expiry_date >= CURRENT_DATE
      AND ${visibleStore("users")}
    `;

  if (category) {
    values.push(category as string);
    query += ` AND products.category = $${values.length}`;
  }

  if (expiryWithinDays) {
    const days = parseNonNegativeInt(expiryWithinDays);
    if (days === null) return null;
    values.push(days);
    query += ` AND products.expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
  }

  if (name) {
    values.push(`%${name}%`);
    query += ` AND products.name ILIKE $${values.length}`;
  }

  // The store's city, from the cities list like the store list's city filter.
  const cityFilter = await parseCityFilter(pool, city_id);
  if ("invalid" in cityFilter) return null;
  if (cityFilter.cityId !== null) {
    values.push(cityFilter.cityId);
    query += ` AND users.city_id = $${values.length}`;
  }

  // A store's profile lists its offers through the marketplace, with the same rules.
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) return null;
    values.push(storeId);
    query += ` AND products.store_id = $${values.length}`;
  }

  const sortKey = sort ?? "newest";
  if (typeof sortKey !== "string" || !Object.hasOwn(SORT_ORDERS, sortKey)) return null;

  // The radius limits a restaurant's search unless it chose a city or a store itself.
  const radius = fromCity !== null && cityFilter.cityId === null && !store_id ? radiusFilter.radius : null;
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
  return { from, values, outsideRadiusCount, sortKey };
};

// The shop's shortage is the store's own business (only its product details show it).
const withoutShortage = (rows: Record<string, unknown>[]) =>
  rows.map(({ shop_shortage: _shortage, ...product }) => product);

export const getProducts = async (req: Request, res: Response) => {
  try {
    const page = parsePage(req.query, CARD_PAGE_SIZE);
    const marketplace = page && (await buildMarketplace(req));
    if (!page || !marketplace) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    const { from, values, outsideRadiusCount, sortKey } = marketplace;
    const { rows, total } = await listPage("listed.*", from, SORT_ORDERS[sortKey]!, values, page);
    return res.status(200).json({ products: withoutShortage(rows), total, outside_radius_count: outsideRadiusCount });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products." });
  }
};

// How Search orders the stores for each product sort: by the best match each store has (the
// newest, the soonest expiry, the lowest or highest price or discount, the nearest).
const STORE_SORT_VALUES: Record<string, string> = {
  newest: "MAX(matched.created_at) DESC",
  expiry: "MIN(matched.expiry_date) ASC",
  price_asc: "MIN(matched.discounted_price) ASC",
  price_desc: "MAX(matched.discounted_price) DESC",
  discount_desc: `MAX(${DISCOUNT.replaceAll("listed.", "matched.")}) DESC`,
  discount_asc: `MIN(${DISCOUNT.replaceAll("listed.", "matched.")}) ASC`,
  distance: "MIN(matched.distance_km) ASC NULLS LAST, MAX(matched.created_at) DESC",
};

// Search shows every match of a store in its slider; this cap only keeps one store with a huge
// offer from making the page heavy (the rest is behind the store page link).
const SEARCH_PRODUCTS_PER_STORE = 50;

// Search (GET /products/by-store): the marketplace's matches grouped by store, paged by store
// (default 12). Each row is a store (logo, name, chain, city, distance, the order pause and its
// open state from the weekly hours), how many of its offers match and its matches in the chosen
// sort (at most SEARCH_PRODUCTS_PER_STORE). Same filters and rules as GET /products.
export const getProductsByStore = async (req: Request, res: Response) => {
  try {
    const page = parsePage(req.query, CARD_PAGE_SIZE);
    const marketplace = page && (await buildMarketplace(req));
    if (!page || !marketplace) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    const { from, values, outsideRadiusCount, sortKey } = marketplace;
    const matched = `WITH matched AS (SELECT listed.* ${from})`;
    const n = values.length;
    const groups = await pool.query<{ store_id: number; match_count: number; total: string }>(
      `${matched}
       SELECT matched.store_id, COUNT(*)::int AS match_count, COUNT(*) OVER () AS total
       FROM matched
       GROUP BY matched.store_id
       ORDER BY ${STORE_SORT_VALUES[sortKey]!}, matched.store_id DESC
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...values, page.limit, page.offset],
    );
    const total = Number(groups.rows[0]?.total ?? 0);
    const storeIds = groups.rows.map((row) => row.store_id);
    if (storeIds.length === 0) {
      return res.status(200).json({ stores: [], total, outside_radius_count: outsideRadiusCount });
    }

    const products = await pool.query(
      `${matched}
       SELECT ranked.* FROM (
         SELECT matched.*, ROW_NUMBER() OVER (
           PARTITION BY matched.store_id ORDER BY ${SORT_ORDERS[sortKey]!.replaceAll("listed.", "matched.")}
         ) AS rank_in_store
         FROM matched
         WHERE matched.store_id = ANY($${n + 1}::int[])
       ) AS ranked
       WHERE ranked.rank_in_store <= $${n + 2}
       ORDER BY ranked.rank_in_store`,
      [...values, storeIds, SEARCH_PRODUCTS_PER_STORE],
    );
    const stores = await pool.query(
      `SELECT users.id, users.business_name, ${storeLogo("users")} AS logo_url,
              ${companyName("users")} AS company_name, cities.name AS city, ${pauseColumns("users")},
              users.opening_schedule
       FROM users LEFT JOIN cities ON cities.id = users.city_id
       WHERE users.id = ANY($1::int[])`,
      [storeIds],
    );
    // The open state comes from the weekly hours this same query returned (no query per store).
    const now = new Date();
    const storeById = new Map(
      stores.rows.map(({ opening_schedule, ...store }) => [
        store.id,
        { ...store, ...openStateAt(opening_schedule as Schedule | null, now) },
      ]),
    );
    const productRows = withoutShortage(products.rows).map(({ rank_in_store: _rank, ...product }) => product);

    return res.status(200).json({
      stores: groups.rows.map((group) => {
        const items = productRows.filter((product) => product.store_id === group.store_id);
        return {
          ...storeById.get(group.store_id),
          distance_km: items[0]?.distance_km ?? null,
          match_count: group.match_count,
          products: items,
        };
      }),
      total,
      outside_radius_count: outsideRadiusCount,
    });
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
    ${companyName("users")} AS company_name,
    cities.name AS city,
    users.address AS store_address,
    users.phone AS store_phone,
    users.pickup_schedule AS store_pickup_schedule,
    ${availableQuantity("products")} AS available_quantity,
    ${soldInShop("products")} AS sold_in_shop,
    ${pendingHeld("products")} AS pending_quantity,
     products.expiry_date - CURRENT_DATE AS days_until_expiry
   FROM products
   JOIN users ON products.store_id = users.id
   LEFT JOIN cities ON cities.id = users.city_id
   WHERE products.id = $1 AND ${visibleStore("users")}`,
      [productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }
    // What the store sold in its own shop (and what its till sold of Pending orders) is its
    // business: others see only the lower availability.
    const { sold_in_shop, shop_shortage, pending_quantity, ...product } = result.rows[0];
    return res.status(200).json({
      product: product.store_id === req.user!.id ? { ...product, sold_in_shop, shop_shortage, pending_quantity } : product,
    });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products." });
  }
};

// A store's own products (GET /products/mine), also shown read-only to its company's headquarters
// (GET /company/branches/:id/products). Null for an invalid filter or page.
export const listStoreProducts = async (storeId: number, query: Request["query"]) => {
  const { status, category, name, expiryWithinDays, sort } = query;
  const page = parsePage(query, CARD_PAGE_SIZE);
  const sortKey = sort ?? "newest";
  if (!page || typeof sortKey !== "string" || !Object.hasOwn(MINE_SORT_ORDERS, sortKey)) {
    return null;
  }

  let from = "FROM products WHERE store_id = $1 AND status != 'Removed'";
  const values: (string | number)[] = [storeId];

  if (category) {
    values.push(category as string);
    from += ` AND category = $${values.length}`;
  }

  if (status) {
    if (!PRODUCT_STATUSES.includes(status as string)) {
      return null;
    }
    values.push(status as string);
    from += ` AND status = $${values.length}`;
  }

  if (expiryWithinDays) {
    const days = parseNonNegativeInt(expiryWithinDays);
    if (days === null) {
      return null;
    }
    values.push(days);
    from += ` AND expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
  }

  if (name) {
    values.push(`%${name}%` as string);
    from += ` AND name ILIKE $${values.length}`;
  }

  // The free quantity (what a sale in the shop can still take) and what the store sold in its shop.
  const { rows, total } = await listPage(
    `products.*, ${availableQuantity("products")} AS available_quantity, ${soldInShop("products")} AS sold_in_shop,
     ${pendingHeld("products")} AS pending_quantity`,
    from,
    MINE_SORT_ORDERS[sortKey]!,
    values,
    page,
  );
  return { products: rows, total };
};

export const getMineProducts = async (req: Request, res: Response) => {
  try {
    const result = await listStoreProducts(req.user!.id, req.query);
    if (!result) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    return res.status(200).json(result);
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
  // Unlike the quantity and expiry date, the image stays editable after publishing.
  // Not sent: the image stays as it is.
  const image = await parseProductImage(req.body?.image_url, req.user!.id);
  if (image && "error" in image) {
    return res.status(400).json({ error: image.error });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // The lock keeps the edit from interleaving with order items created or accepted meanwhile.
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
           discounted_price = $5, unit = $6, image_url = $7
       WHERE id = $8
       RETURNING *`,
      [
        name.trim(),
        description,
        category,
        original_price,
        discounted_price,
        unit,
        image ? image.value : existing.rows[0].image_url,
        productId,
      ],
    );

    await client.query("COMMIT");
    if (image && image.value !== existing.rows[0].image_url) {
      await releaseProductImage(pool, existing.rows[0].image_url);
    }
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
    // The lock keeps an order from taking the product between the checks and the delete, so a
    // product with an active order item can never be removed through this route.
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
    const activeOrderItems = await client.query(
      "SELECT order_items.id FROM order_items WHERE order_items.product_id = $1 AND order_items.status IN ('Pending', 'Confirmed', 'InDelivery')",
      [productId],
    );

    if (activeOrderItems.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Product has active orders and cannot be deleted.",
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
    // Refunded only on the credit day of the charge and only if nothing was ordered (a
    // picked-up order item counts); otherwise the credit stays spent.
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

// The restaurant home page's offer rows (GET /products/home): up to three stores with
// offers (its favourites first, then the nearest), each with its offer count and the four offers
// that expire soonest. See services/homeOffers.ts.
export const getHomeOffersForRestaurant = async (req: Request, res: Response) => {
  try {
    const stores = await getHomeOffers(req.user!.id);
    return res.status(200).json({ message: "Home offers fetched successfully.", stores });
  } catch (error) {
    console.error("Error while fetching home offers:", error);
    return res.status(500).json({ error: "An error occurred while fetching products." });
  }
};
