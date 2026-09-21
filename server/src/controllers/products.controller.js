import pool from "../config/db.js";
import { validateProductFields } from "../utils/validateProduct.js";

export const createProduct = async (req, res) => {
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
    } = req.body;
    const store_id = req.user.id;
    const validationError = validateProductFields(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const result = await pool.query(
      "INSERT INTO products (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
      [
        store_id,
        name,
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

export const getProducts = async (req, res) => {
  try {
    const { category, maxPrice, expiryWithinDays, name } = req.query;

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
    let values = [];

    if (category) {
      values.push(category);
      query += ` AND products.category = $${values.length}`;
    }

    if (maxPrice) {
      values.push(parseFloat(maxPrice));
      query += ` AND products.discounted_price <= $${values.length}`;
    }

    if (expiryWithinDays) {
      values.push(parseInt(expiryWithinDays));
      query += ` AND products.expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%`);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    query += " ORDER BY products.created_at DESC";

    const result = await pool.query(query, values);

    return res.status(200).json({ products: result.rows });
  } catch (error) {
    console.error("Greška prilikom dohvatanja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja proizvoda." });
  }
};

export const getProductById = async (req, res) => {
  try {
    const productId = req.params.id;

    const result = await pool.query(
      `SELECT 
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

export const getMineProducts = async (req, res) => {
  try {
    const store_id = req.user.id;
    const { status, category, name, expiryWithinDays } = req.query;

    let query =
      "SELECT * FROM products WHERE store_id = $1 AND status != 'Removed'";
    let values = [store_id];

    if (category) {
      values.push(category);
      query += ` AND category = $${values.length}`;
    }

    if (status) {
      values.push(status);
      query += ` AND status = $${values.length}`;
    }

    if (expiryWithinDays) {
      values.push(parseInt(expiryWithinDays));
      query += ` AND expiry_date <= CURRENT_DATE + ($${values.length} * INTERVAL '1 day')`;
    }

    if (name) {
      values.push(`%${name}%`);
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

export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      name,
      description,
      category,
      original_price,
      discounted_price,
      quantity,
      unit,
      expiry_date,
    } = req.body || {};
    const validationError = validateProductFields(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const existing = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    if (existing.rows[0].store_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Nemate dozvolu za izmjenu ovog proizvoda." });
    }

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, description = $2, category = $3, original_price = $4, 
           discounted_price = $5, quantity = $6, unit = $7, expiry_date = $8
       WHERE id = $9
       RETURNING *`,
      [
        name,
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

    return res.status(200).json({
      message: "Proizvod uspješno ažuriran.",
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Greška prilikom ažuriranja proizvoda:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom ažuriranja proizvoda." });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const existing = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }

    if (existing.rows[0].store_id !== req.user.id) {
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
