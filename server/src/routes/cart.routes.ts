import express from "express";
import {
  clearCartRoute,
  clearUnavailableRoute,
  deleteCartItemRoute,
  getCartCountRoute,
  getCartRoute,
  putCartItemRoute,
} from "../controllers/cart.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(authenticate, authorize("RESTAURANT"));
router.get("/", getCartRoute);
router.get("/count", getCartCountRoute);
router.put("/items/:productId", putCartItemRoute);
router.delete("/items/:productId", deleteCartItemRoute);
router.delete("/unavailable", clearUnavailableRoute);
router.delete("/", clearCartRoute);

export default router;
