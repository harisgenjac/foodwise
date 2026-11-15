import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";
import { validateTemplateFields } from "../utils/validateProduct.js";
import { parseProductImage, releaseProductImage } from "../utils/productImages.js";

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
    console.error("Error while fetching templates:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching templates." });
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

  const image = await parseProductImage(req.body?.image_url, store_id);
  if (image && "error" in image) {
    return res.status(400).json({ error: image.error });
  }

  try {
    const previous = await pool.query(
      "SELECT product_templates.image_url FROM product_templates WHERE product_templates.store_id = $1 AND product_templates.name = $2",
      [store_id, name],
    );
    // Saving under an existing name updates that template instead of creating a duplicate.
    const result = await pool.query(
      `INSERT INTO product_templates
         (store_id, name, description, category, unit, original_price, discounted_price, quantity, shelf_life_days, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (store_id, name) DO UPDATE SET
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         unit = EXCLUDED.unit,
         original_price = EXCLUDED.original_price,
         discounted_price = EXCLUDED.discounted_price,
         quantity = EXCLUDED.quantity,
         shelf_life_days = EXCLUDED.shelf_life_days,
         image_url = EXCLUDED.image_url
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
        image?.value ?? null,
      ],
    );
    const replaced = previous.rows[0]?.image_url;
    if (replaced && replaced !== result.rows[0].image_url) {
      await releaseProductImage(pool, replaced);
    }
    return res.status(201).json({
      message: "Template saved successfully.",
      template: result.rows[0],
    });
  } catch (error) {
    console.error("Error while saving template:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while saving the template." });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  const store_id = req.user!.id;
  const templateId = parseId(req.params.id);
  if (templateId === null) {
    return res.status(404).json({ error: "Template not found." });
  }

  try {
    const existing = await pool.query(
      `SELECT store_id, image_url FROM product_templates WHERE id = $1`,
      [templateId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Template not found." });
    }
    if (existing.rows[0].store_id !== store_id) {
      return res
        .status(403)
        .json({ error: "You are not allowed to delete this template." });
    }

    await pool.query(`DELETE FROM product_templates WHERE id = $1`, [templateId]);
    await releaseProductImage(pool, existing.rows[0].image_url);
    return res.status(200).json({ message: "Template deleted successfully." });
  } catch (error) {
    console.error("Error while deleting template:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting the template." });
  }
};
