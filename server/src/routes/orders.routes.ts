import express from "express";
import {
  cancelOrderRoute,
  cancelOverdueOrderRoute,
  completeOrderRoute,
  createOrder,
  decideOrderRoute,
  getMineOrders,
  getMineOrdersSummary,
  getOrder,
  getOrderPickupCounts,
  getOrderPickups,
  getStoreOrders,
} from "../controllers/orders.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.post("/", authenticate, authorize("RESTAURANT"), createOrder);
router.get("/mine", authenticate, authorize("RESTAURANT"), getMineOrders);
router.get("/mine/summary", authenticate, authorize("RESTAURANT"), getMineOrdersSummary);
router.get("/store", authenticate, authorize("STORE"), getStoreOrders);
router.get("/pickups", authenticate, authorize("STORE", "RESTAURANT"), getOrderPickups);
router.get("/pickups/counts", authenticate, authorize("STORE", "RESTAURANT"), getOrderPickupCounts);
// Actions are POST /orders/:id/<action>: an action with a body, not a field update.
router.post("/:id/decision", authenticate, authorize("STORE"), decideOrderRoute);
router.post("/:id/cancel", authenticate, authorize("RESTAURANT"), cancelOrderRoute);
router.post("/:id/complete", authenticate, authorize("STORE"), completeOrderRoute);
router.post("/:id/cancel-overdue", authenticate, authorize("STORE"), cancelOverdueOrderRoute);
router.get("/:id", authenticate, authorize("STORE", "RESTAURANT"), getOrder);

export default router;
