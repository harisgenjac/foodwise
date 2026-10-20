import express from "express";
import {
  createDonation,
  deleteDonation,
  donateProduct,
  getDonationById,
  getMineDonations,
  updateDonation,
} from "../controllers/donations.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", authenticate, authorize("STORE", "RESTAURANT"), createDonation);
router.get("/mine", authenticate, authorize("STORE", "RESTAURANT"), getMineDonations);
router.post("/from-product/:productId", authenticate, authorize("STORE"), donateProduct);
router.get("/:id", authenticate, authorize("STORE", "RESTAURANT"), getDonationById);
router.put("/:id", authenticate, authorize("STORE", "RESTAURANT"), updateDonation);
router.delete("/:id", authenticate, authorize("STORE", "RESTAURANT"), deleteDonation);

export default router;
