import express from "express";
import {
  clearCartRoute,
  clearUnavailableRoute,
  deleteCartItemRoute,
  getCartDeliveryRoute,
  getCartRoute,
  putCartItemRoute,
} from "../controllers/cart.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(authenticate, authorize("RESTAURANT"));
router.get("/", getCartRoute);
// Whether the cart's store can deliver now, with the provider's estimate.
router.get("/delivery", getCartDeliveryRoute);
router.put("/items/:productId", putCartItemRoute);
router.delete("/items/:productId", deleteCartItemRoute);
router.delete("/unavailable", clearUnavailableRoute);
router.delete("/", clearCartRoute);

export default router;
