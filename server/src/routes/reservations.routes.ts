import express from "express";
import {
  createReservation,
  getReservationById,
  getMineReservations,
  getMineReservationsSummary,
  getStoreReservations,
  acceptReservation,
  rejectReservation,
  cancelReservation,
  getPickups,
  getPickupCounts,
  completeReservation,
  cancelOverdueReservation,
} from "../controllers/reservations.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.post("/", authenticate, authorize("RESTAURANT"), createReservation);
router.get("/mine", authenticate, authorize("RESTAURANT"), getMineReservations);
router.get("/mine/summary", authenticate, authorize("RESTAURANT"), getMineReservationsSummary);
router.get("/store", authenticate, authorize("STORE"), getStoreReservations);
router.get("/pickups", authenticate, authorize("STORE", "RESTAURANT"), getPickups);
router.get("/pickups/counts", authenticate, authorize("STORE", "RESTAURANT"), getPickupCounts);
router.patch(
  "/:id/accept",
  authenticate,
  authorize("STORE"),
  acceptReservation,
);
router.patch(
  "/:id/reject",
  authenticate,
  authorize("STORE"),
  rejectReservation,
);
router.patch(
  "/:id/cancel",
  authenticate,
  authorize("RESTAURANT"),
  cancelReservation,
);
router.patch(
  "/:id/complete",
  authenticate,
  authorize("STORE"),
  completeReservation,
);
router.patch(
  "/:id/cancel-overdue",
  authenticate,
  authorize("STORE"),
  cancelOverdueReservation,
);
router.get("/:id", authenticate, authorize("STORE", "RESTAURANT"), getReservationById);

export default router;
