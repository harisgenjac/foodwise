import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { parseId } from "../utils/params.js";
import { adminCancelOrder } from "../services/orders/actions.js";
import { getOrderDetails, listAdminOrders } from "../services/orders/queries.js";
import { REASON_ERROR, logAdminAction, parseReason } from "./admin.controller.js";

// The admin's orders (docs/orders-design.md, section 8): every order on the platform, one order's
// details, and cancelling an order to resolve a dispute.

const FETCH_ERROR = "An error occurred while fetching orders.";

export const getAdminOrders = async (req: Request, res: Response) => {
  try {
    const result = await listAdminOrders(req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", ...result });
  } catch (error) {
    console.error("Error while fetching orders:", error);
    return res.status(500).json({ error: FETCH_ERROR });
  }
};

export const getAdminOrder = async (req: Request, res: Response) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  try {
    const order = await getOrderDetails(orderId, null);
    if (!order) return res.status(404).json({ error: "Order not found." });
    return res.status(200).json({ message: "Order fetched successfully.", order });
  } catch (error) {
    console.error("Error while fetching orders:", error);
    return res.status(500).json({ error: FETCH_ERROR });
  }
};

// Resolves a dispute: a Pending or Confirmed order is cancelled with a required reason and both
// sides are told why. Cancelling a Confirmed one puts its quantities back on offer.
export const cancelAdminOrder = async (req: Request, res: Response) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  const reason = parseReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: REASON_ERROR });
  const adminId = req.user!.id;
  try {
    const order = await inTransaction(async (client) => {
      const cancelled = await adminCancelOrder(client, adminId, orderId, reason);
      // The audit row targets the restaurant; the store sees it through the order.
      await logAdminAction(client, {
        adminId,
        action: "CANCEL_ORDER",
        targetUserId: cancelled.restaurant_id,
        targetOrderId: orderId,
        reason,
      });
      return cancelled;
    });
    return res.status(200).json({ message: "Order cancelled.", order });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body());
    console.error("Error while cancelling the order:", error);
    return res.status(500).json({ error: "An error occurred while cancelling the order." });
  }
};
