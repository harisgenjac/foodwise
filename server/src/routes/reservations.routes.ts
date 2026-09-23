import express from "express";
import {
  createReservation,
  getReservationById,
  getMineReservations,
  getStoreReservations,
  acceptReservation,
  rejectReservation,
  cancelReservation,
} from "../controllers/reservations.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.post("/", authenticate, authorize("RESTAURANT"), createReservation);
router.get("/mine", authenticate, authorize("RESTAURANT"), getMineReservations);
router.get("/store", authenticate, authorize("STORE"), getStoreReservations);
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
router.get("/:id", authenticate, getReservationById);

export default router;
