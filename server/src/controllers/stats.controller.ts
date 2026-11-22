import type { Request, Response } from "express";
import { getRestaurantImpact, getStoreImpact } from "../services/impactStats.js";
import { getStoreHome } from "../services/storeHome.js";

// The home page's stats: the caller's own totals (zeros before its first pickup). A restaurant gets
// what it picked up, a store what restaurants picked up from it.
export const getMyImpact = async (req: Request, res: Response) => {
  try {
    const { id, role } = req.user!;
    const impact = role === "STORE" ? await getStoreImpact(id) : await getRestaurantImpact(id);
    return res.status(200).json({ message: "Impact stats fetched successfully.", impact });
  } catch (error) {
    console.error("Error while fetching impact statistics:", error);
    return res.status(500).json({ error: "An error occurred while fetching impact statistics." });
  }
};

// The store home page's "Danas" counts, newest orders and soonest-expiring products.
export const getStoreHomeData = async (req: Request, res: Response) => {
  try {
    const home = await getStoreHome(req.user!.id);
    return res.status(200).json({ message: "Store home fetched successfully.", ...home });
  } catch (error) {
    console.error("Error while fetching the store home:", error);
    return res.status(500).json({ error: "An error occurred while fetching the store home." });
  }
};
