import express from "express";
import {
  blockUser,
  cancelReservation,
  createUser,
  getAdminActions,
  getAdminDonations,
  getAdminProducts,
  getAdminReservations,
  getStats,
  getUserDetails,
  getUsers,
  removeDonation,
  removeProduct,
  resetPassword,
  unblockUser,
} from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(authenticate, authorize("ADMIN"));

router.get("/stats", getStats);
router.get("/users", getUsers);
router.post("/users", createUser);
router.get("/users/:id", getUserDetails);
router.patch("/users/:id/password", resetPassword);
router.post("/users/:id/block", blockUser);
router.post("/users/:id/unblock", unblockUser);
router.get("/products", getAdminProducts);
router.delete("/products/:id", removeProduct);
router.get("/donations", getAdminDonations);
router.delete("/donations/:id", removeDonation);
router.get("/reservations", getAdminReservations);
router.post("/reservations/:id/cancel", cancelReservation);
router.get("/actions", getAdminActions);

export default router;
