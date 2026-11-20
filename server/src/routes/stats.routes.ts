import express from "express";
import { getMyImpact } from "../controllers/stats.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/my-impact", authenticate, authorize("RESTAURANT", "STORE"), getMyImpact);

export default router;
