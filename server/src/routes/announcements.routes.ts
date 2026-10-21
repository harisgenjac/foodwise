import express from "express";
import { dismissAnnouncement, getActiveAnnouncements } from "../controllers/announcements.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// Platform announcements as stores and restaurants see them; admins manage them under /api/admin.
const router = express.Router();
router.get("/active", authenticate, authorize("STORE", "RESTAURANT"), getActiveAnnouncements);
router.post("/:id/dismiss", authenticate, authorize("STORE", "RESTAURANT"), dismissAnnouncement);

export default router;
