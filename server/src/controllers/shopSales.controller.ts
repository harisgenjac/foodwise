import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId, parseNumber } from "../utils/params.js";
import { markSoldIfFullyConfirmed } from "./reservations.controller.js";
import { freeQuantity } from "../services/stock.js";

// Sold in shop: a store also sells at its own till, so the app's stock can be higher than what is
// really left. The store records the amount it sold there, which lowers the product's free quantity
// (available = quantity − reservations − sold in shop). An entry is never edited or deleted (a
// mistake means publishing a new product), never gives a credit back and is never an app sale:
// reports, statistics, "products sold" and food saved ignore it. Quantity held by reservations
// cannot be taken here.

// The amount as it would read in the message: 2.5, not 2.50.
const formatAmount = (value: number) => String(Math.round(value * 1000) / 1000);

// POST /products/:id/shop-sales { quantity }.
export const recordShopSale = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }
  const quantity = parseNumber(req.body.quantity);
  if (quantity === null || quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be greater than zero." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // The product lock keeps a reservation from taking the same quantity in between.
    const result = await client.query(
      `SELECT products.id, products.store_id, products.name, products.quantity, products.status,
         products.expiry_date < CURRENT_DATE AS is_expired
       FROM products WHERE products.id = $1 FOR UPDATE`,
      [productId],
    );
    const product = result.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.store_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not allowed to record a sale for this product." });
    }
    if (product.status !== "Available" || product.is_expired) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only available products can be recorded as sold in the shop." });
    }
    const free = await freeQuantity(client, productId);
    if (quantity > free) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `You can record at most the free quantity (${formatAmount(free)}).` });
    }

    const sale = await client.query(
      `INSERT INTO product_shop_sales (product_id, store_id, quantity, created_by)
       VALUES ($1, $2, $3, $2)
       RETURNING id, product_id, quantity, created_at`,
      [productId, product.store_id, quantity],
    );
    // Nothing free left and no pending reservation holding any: sold out, like any product. The
    // store did it itself, so it gets no "sold out" notification.
    const soldOut = await markSoldIfFullyConfirmed(client, product, { notify: false });
    const available = await freeQuantity(client, productId);
    await client.query("COMMIT");
    return res.status(201).json({
      message: "Sale in the shop recorded.",
      sale: sale.rows[0],
      available_quantity: available,
      status: soldOut ? "Sold" : product.status,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while recording a sale in the shop:", error);
    return res.status(500).json({ error: "An error occurred while recording the sale." });
  } finally {
    if (client) client.release();
  }
};

// GET /products/:id/shop-sales: the product's entries, newest first, for its store only.
export const getShopSales = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }
  try {
    const product = await pool.query("SELECT products.store_id FROM products WHERE products.id = $1", [productId]);
    if (!product.rows[0]) {
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.rows[0].store_id !== req.user!.id) {
      return res.status(403).json({ error: "You are not allowed to see the sales of this product." });
    }
    const sales = await pool.query(
      `SELECT product_shop_sales.id, product_shop_sales.quantity, product_shop_sales.created_at,
         creators.email AS created_by_email
       FROM product_shop_sales
       LEFT JOIN users AS creators ON creators.id = product_shop_sales.created_by
       WHERE product_shop_sales.product_id = $1
       ORDER BY product_shop_sales.created_at DESC, product_shop_sales.id DESC`,
      [productId],
    );
    return res.status(200).json({ message: "Shop sales fetched successfully.", sales: sales.rows });
  } catch (error) {
    console.error("Error while fetching shop sales:", error);
    return res.status(500).json({ error: "An error occurred while fetching shop sales." });
  }
};
