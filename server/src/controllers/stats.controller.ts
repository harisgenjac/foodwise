import type { Request, Response } from "express";
import { getRestaurantImpact } from "../services/impactStats.js";

// The restaurant home page's stats: the restaurant's own totals (zeros before its first pickup).
export const getMyImpact = async (req: Request, res: Response) => {
  try {
    const impact = await getRestaurantImpact(req.user!.id);
    return res.status(200).json({ message: "Impact stats fetched successfully.", impact });
  } catch (error) {
    console.error("Error while fetching impact statistics:", error);
    return res.status(500).json({ error: "An error occurred while fetching impact statistics." });
  }
};
