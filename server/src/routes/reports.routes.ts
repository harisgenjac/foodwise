import express from "express";
import { getImpactReport, getSalesReport } from "../controllers/reports.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// Both roles; each report only covers the caller's own reservations (see pickupOwnership).
const router = express.Router();
router.get("/sales", authenticate, authorize("STORE", "RESTAURANT"), getSalesReport);
router.get("/impact", authenticate, authorize("STORE", "RESTAURANT"), getImpactReport);

export default router;
