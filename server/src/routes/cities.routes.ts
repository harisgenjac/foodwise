import express from "express";
import { getCities } from "../controllers/cities.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", authenticate, authorize("STORE", "RESTAURANT", "ADMIN", "COMPANY"), getCities);

export default router;
