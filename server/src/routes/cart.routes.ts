import express from "express";
import {
  clearCartRoute,
  clearUnavailableRoute,
  deleteCartItemRoute,
  getCartRoute,
  putCartItemRoute,
} from "../controllers/cart.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(authenticate, authorize("RESTAURANT"));
router.get("/", getCartRoute);
router.put("/items/:productId", putCartItemRoute);
router.delete("/items/:productId", deleteCartItemRoute);
router.delete("/unavailable", clearUnavailableRoute);
router.delete("/", clearCartRoute);

export default router;
