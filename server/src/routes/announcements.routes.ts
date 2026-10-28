import express from "express";
import { dismissAnnouncement, getActiveAnnouncements } from "../controllers/announcements.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// Platform announcements as stores, restaurants and company headquarters see them; admins manage
// them under /api/admin.
const router = express.Router();
router.get("/active", authenticate, authorize("STORE", "RESTAURANT", "COMPANY"), getActiveAnnouncements);
router.post("/:id/dismiss", authenticate, authorize("STORE", "RESTAURANT", "COMPANY"), dismissAnnouncement);

export default router;
