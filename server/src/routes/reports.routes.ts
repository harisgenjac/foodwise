import express from "express";
import { getImpactReport, getSalesReport } from "../controllers/reports.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

// Both roles; each report only covers the caller's own reservations (see pickupOwnership).
const router = express.Router();
router.get("/sales", authenticate, getSalesReport);
router.get("/impact", authenticate, getImpactReport);

export default router;
