import express from "express";
import { getImpact, getMyImpact } from "../controllers/stats.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/impact", authenticate, authorize("STORE", "RESTAURANT", "ADMIN", "COMPANY"), getImpact);
router.get("/my-impact", authenticate, authorize("RESTAURANT"), getMyImpact);

export default router;
