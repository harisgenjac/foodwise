import pool from "../config/db.js";
import type { Request, Response } from "express";

export const addFavorite = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;
    const { store_id } = req.body;

    await pool.query(
      `INSERT INTO favorites (restaurant_id, store_id) VALUES ($1, $2)`,
      [restaurant_id, store_id],
    );
    return res.status(201).json({ message: "Prodavnica dodana u omiljene" });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === "23505") {
      return res
        .status(409)
        .json({ error: "Prodavnica je vec dodana u omiljene." });
    }

    console.error("Greška prilikom dodavanja prodavnice u omiljene:", error);
    return res
      .status(500)
      .json({
        error: "Došlo je do greške prilikom dodavanja prodavnice u omiljene.",
      });
  }
};

export const removeFavorite = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;
    const storeId = req.params.storeId;

    const result = await pool.query(
      `DELETE FROM favorites WHERE restaurant_id = $1 AND store_id = $2`,
      [restaurant_id, storeId],
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Prodavnica nije bila u omiljenim." });
    }
    return res
      .status(200)
      .json({ message: "Prodavnica izbrisana iz omiljenih" });
  } catch (error) {
    console.error("Greška prilikom brisanja prodavnice iz omiljenih:", error);
    return res
      .status(500)
      .json({
        error: "Došlo je do greške prilikom brisanja prodavnice iz omiljenih.",
      });
  }
};

export const getFavorites = async (req: Request, res: Response) => {
  try {
    const restaurant_id = req.user!.id;

    const result = await pool.query(
      `SELECT users.id, users.business_name, users.city, users.address, 
        users.logo_url, users.description, users.opening_hours, users.pickup_hours, users.phone FROM favorites 
        JOIN users ON favorites.store_id = users.id
        WHERE favorites.restaurant_id = $1`,
      [restaurant_id],
    );
    return res
      .status(200)
      .json({
        message: "Uspješno dohvaćene omiljene prodavnice",
        favorites: result.rows,
      });
  } catch (error) {
    console.error("Greška prilikom dohvatanja omiljenih prodavnica:", error);
    return res
      .status(500)
      .json({
        error: "Došlo je do greške prilikom dohvatanja omiljenih prodavnica.",
      });
  }
};
