import express from "express";
import { deliveryWebhook, simulateCourier } from "../controllers/delivery.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// The provider's webhooks, mounted before express.json() (app.ts): the signature is checked over
// the raw body, so every content type is read as bytes.
export const deliveryWebhookRoutes = express.Router();
deliveryWebhookRoutes.post("/:provider", express.raw({ type: () => true, limit: "100kb" }), deliveryWebhook);

// Development only (app.ts mounts it outside production): the mock's courier.
export const deliveryDevRoutes = express.Router();
deliveryDevRoutes.post(
  "/mock/orders/:id/simulate",
  authenticate,
  authorize("STORE", "RESTAURANT"),
  simulateCourier,
);
