import express from "express";
import { getImpact } from "../controllers/stats.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/impact", authenticate, authorize("STORE", "RESTAURANT", "ADMIN"), getImpact);

export default router;
