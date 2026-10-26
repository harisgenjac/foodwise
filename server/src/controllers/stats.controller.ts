import type { Request, Response } from "express";
import { getSavedTotals } from "../services/impactStats.js";

// Platform-wide food saved in kg, for the footer's impact counter (every logged-in role).
export const getImpact = async (req: Request, res: Response) => {
  try {
    const { kg } = await getSavedTotals();
    return res.status(200).json({ message: "Impact stats fetched successfully.", kg });
  } catch (error) {
    console.error("Error while fetching impact statistics:", error);
    return res.status(500).json({ error: "An error occurred while fetching impact statistics." });
  }
};
