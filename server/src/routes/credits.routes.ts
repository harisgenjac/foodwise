import express from "express";
import {
  createRequest,
  getMyCredits,
  getMyHistory,
  getMyRequests,
  getPlans,
  getTopupPackages,
  setAutoRenew,
  withdrawRequest,
} from "../controllers/credits.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// Credits of the logged-in store or restaurant; admins manage credits under /api/admin/credits.
const router = express.Router();
router.use(authenticate, authorize("STORE", "RESTAURANT"));

router.get("/plans", getPlans);
router.get("/topup-packages", getTopupPackages);
router.get("/me", getMyCredits);
router.get("/me/history", getMyHistory);
router.get("/requests", getMyRequests);
router.post("/requests", createRequest);
router.delete("/requests/:id", withdrawRequest);
router.patch("/subscription/auto-renew", setAutoRenew);

export default router;
