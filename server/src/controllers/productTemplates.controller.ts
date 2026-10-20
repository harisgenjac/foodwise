import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";
import { validateTemplateFields } from "../utils/validateProduct.js";

// Optional numeric fields arrive as "" from empty form inputs; store those as NULL.
const toNullable = (value: unknown) =>
  value === undefined || value === null || value === "" ? null : value;

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const store_id = req.user!.id;
    const result = await pool.query(
      `SELECT * FROM product_templates WHERE store_id = $1 ORDER BY updated_at DESC`,
      [store_id],
    );
    return res.status(200).json({ templates: result.rows });
  } catch (error) {
    console.error("Greška prilikom dohvatanja predložaka:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja predložaka." });
  }
};

export const saveTemplate = async (req: Request, res: Response) => {
  const store_id = req.user!.id;
  const {
    name,
    description,
    category,
    unit,
    original_price,
    discounted_price,
    quantity,
    shelf_life_days,
  } = req.body ?? {};

  const validationError = validateTemplateFields(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    // Saving under an existing name updates that template instead of creating a duplicate.
    const result = await pool.query(
      `INSERT INTO product_templates
         (store_id, name, description, category, unit, original_price, discounted_price, quantity, shelf_life_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (store_id, name) DO UPDATE SET
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         unit = EXCLUDED.unit,
         original_price = EXCLUDED.original_price,
         discounted_price = EXCLUDED.discounted_price,
         quantity = EXCLUDED.quantity,
         shelf_life_days = EXCLUDED.shelf_life_days
       RETURNING *`,
      [
        store_id,
        name,
        toNullable(description),
        category,
        unit,
        toNullable(original_price),
        toNullable(discounted_price),
        toNullable(quantity),
        toNullable(shelf_life_days),
      ],
    );
    return res.status(201).json({
      message: "Predložak uspješno sačuvan.",
      template: result.rows[0],
    });
  } catch (error) {
    console.error("Greška prilikom čuvanja predloška:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom čuvanja predloška." });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  const store_id = req.user!.id;
  const templateId = parseId(req.params.id);
  if (templateId === null) {
    return res.status(404).json({ error: "Predložak nije pronađen." });
  }

  try {
    const existing = await pool.query(
      `SELECT store_id FROM product_templates WHERE id = $1`,
      [templateId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Predložak nije pronađen." });
    }
    if (existing.rows[0].store_id !== store_id) {
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za brisanje ovog predloška." });
    }

    await pool.query(`DELETE FROM product_templates WHERE id = $1`, [templateId]);
    return res.status(200).json({ message: "Predložak uspješno obrisan." });
  } catch (error) {
    console.error("Greška prilikom brisanja predloška:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom brisanja predloška." });
  }
};
