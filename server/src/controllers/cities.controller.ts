import type { Request, Response } from "express";
import pool from "../config/db.js";

// The fixed city list for dropdowns, in Bosnian alphabetical order (Č, Ć, Đ, Š, Ž included).
export const getCities = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT cities.id, cities.name FROM cities ORDER BY cities.name COLLATE "bs-x-icu"`,
    );
    return res.status(200).json({ message: "Cities fetched successfully.", cities: result.rows });
  } catch (error) {
    console.error("Error while fetching cities:", error);
    return res.status(500).json({ error: "An error occurred while fetching cities." });
  }
};
