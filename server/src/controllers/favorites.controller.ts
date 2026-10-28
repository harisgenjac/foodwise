import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";

export const addFavorite = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;
    const { store_id } = req.body;

    if (!store_id) {
      return res.status(400).json({ error: "Store ID is required." });
    }

    const storeId = parseId(store_id);
    if (storeId === null) {
      return res.status(404).json({ error: "Store not found." });
    }

    const store = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'STORE' AND is_blocked = false`,
      [storeId],
    );
    if (store.rows.length === 0) {
      return res.status(404).json({ error: "Store not found." });
    }

    await pool.query(
      `INSERT INTO favorites (restaurant_id, store_id) VALUES ($1, $2)`,
      [restaurant_id, storeId],
    );
    return res.status(201).json({ message: "Store added to favorites" });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === "23505") {
      return res
        .status(409)
        .json({ error: "Store is already in favorites." });
    }

    console.error("Error while adding store to favorites:", error);
    return res
      .status(500)
      .json({
        error: "An error occurred while adding the store to favorites.",
      });
  }
};

export const removeFavorite = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;
    const storeId = parseId(req.params.storeId);
    if (storeId === null) {
      return res
        .status(404)
        .json({ error: "Store was not in favorites." });
    }

    const result = await pool.query(
      `DELETE FROM favorites WHERE restaurant_id = $1 AND store_id = $2`,
      [restaurant_id, storeId],
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Store was not in favorites." });
    }
    return res
      .status(200)
      .json({ message: "Store removed from favorites" });
  } catch (error) {
    console.error("Error while removing store from favorites:", error);
    return res
      .status(500)
      .json({
        error: "An error occurred while removing the store from favorites.",
      });
  }
};

export const getFavorites = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;

    const result = await pool.query(
      `SELECT users.id, users.business_name, users.city_id, cities.name AS city, users.address,
        users.logo_url, users.description, users.opening_hours, users.pickup_hours, users.phone FROM favorites 
        JOIN users ON favorites.store_id = users.id
        LEFT JOIN cities ON cities.id = users.city_id
        WHERE favorites.restaurant_id = $1 AND users.is_blocked = false`,
      [restaurant_id],
    );
    return res
      .status(200)
      .json({
        message: "Favorite stores fetched successfully",
        favorites: result.rows,
      });
  } catch (error) {
    console.error("Error while fetching favorite stores:", error);
    return res
      .status(500)
      .json({
        error: "An error occurred while fetching favorite stores.",
      });
  }
};
