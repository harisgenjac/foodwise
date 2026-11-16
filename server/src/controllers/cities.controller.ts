import type { Request, Response } from "express";
import pool from "../config/db.js";

// The fixed city list for dropdowns, in Bosnian alphabetical order (Č, Ć, Đ, Š, Ž included), with
// each centre's coordinates (where the location map on a profile starts).
export const getCities = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT cities.id, cities.name, cities.latitude::float8 AS latitude, cities.longitude::float8 AS longitude
       FROM cities ORDER BY cities.name COLLATE "bs-x-icu"`,
    );
    return res.status(200).json({ message: "Cities fetched successfully.", cities: result.rows });
  } catch (error) {
    console.error("Error while fetching cities:", error);
    return res.status(500).json({ error: "An error occurred while fetching cities." });
  }
};
