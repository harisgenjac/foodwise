import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { HttpError, sendError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { parseId } from "../utils/params.js";
import { parseSendOrderBody, sendOrder } from "../services/orders/send.js";
import { decideOrder } from "../services/orders/decision.js";
import { reportProblem } from "../services/orderProblems.js";
import { rateOrderCourier } from "../services/courierRatings.js";
import {
  cancelFailedDelivery,
  cancelOrder,
  cancelOverdueOrder,
  completeOrder,
  switchToPickup,
} from "../services/orders/actions.js";
import {
  countPickupOrders,
  getOrderDetails,
  listMineOrders,
  listPackingList,
  listPickupOrders,
  listStoreOrders,
  summarizeMineOrders,
} from "../services/orders/queries.js";

// /api/orders (docs/product.md). The order service throws an HttpError for
// every refusal; anything else is logged and answered with 500.

// A refusal of the order service answers with its status; anything else is logged with the
// answer's text and is a 500.
const FETCH_ERROR = "An error occurred while fetching orders.";

export const createOrder = async (req: Request, res: Response) => {
  try {
    const input = parseSendOrderBody(req.body);
    const sent = await inTransaction((client) => sendOrder(client, req.user!.id, input));
    return res.status(201).json({ message: "Order sent.", order: { ...sent.order, items: sent.items }, changes: sent.changes });
  } catch (error) {
    return sendError(res, error, "An error occurred while sending the order.");
  }
};

export const getMineOrders = async (req: Request, res: Response) => {
  try {
    const result = await listMineOrders(req.user!.id, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", ...result });
  } catch (error) {
    return sendError(res, error, FETCH_ERROR);
  }
};

export const getMineOrdersSummary = async (req: Request, res: Response) => {
  try {
    const summary = await summarizeMineOrders(req.user!.id, req.query);
    if (!summary) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", summary });
  } catch (error) {
    return sendError(res, error, FETCH_ERROR);
  }
};

export const getStoreOrders = async (req: Request, res: Response) => {
  try {
    const result = await listStoreOrders(req.user!.id, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", ...result });
  } catch (error) {
    return sendError(res, error, FETCH_ERROR);
  }
};

export const getOrderPickups = async (req: Request, res: Response) => {
  try {
    const result = await listPickupOrders(req.user!.id, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Pickups fetched successfully.", ...result });
  } catch (error) {
    return sendError(res, error, "An error occurred while fetching pickups.");
  }
};

export const getOrderPickupCounts = async (req: Request, res: Response) => {
  try {
    const counts = await countPickupOrders(req.user!.id);
    return res.status(200).json({ message: "Pickups fetched successfully.", counts });
  } catch (error) {
    return sendError(res, error, "An error occurred while fetching pickups.");
  }
};

export const getPackingList = async (req: Request, res: Response) => {
  try {
    const list = await listPackingList(req.user!.id);
    return res.status(200).json({ message: "Packing list fetched successfully.", ...list });
  } catch (error) {
    return sendError(res, error, "An error occurred while fetching the packing list.");
  }
};

export const getOrder = async (req: Request, res: Response) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  try {
    const order = await getOrderDetails(orderId, req.user!.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    return res.status(200).json({ message: "Order fetched successfully.", order });
  } catch (error) {
    return sendError(res, error, FETCH_ERROR);
  }
};

// One action on one order: the id from the route, the service in a transaction, the message.
const orderAction =
  (
    run: (client: PoolClient, userId: number, orderId: number, body: Record<string, unknown>) => Promise<unknown>,
    message: string,
    errorMessage: string,
  ) =>
  async (req: Request, res: Response) => {
    const orderId = parseId(req.params.id);
    if (orderId === null) return res.status(404).json({ error: "Order not found." });
    try {
      const order = await inTransaction((client) => run(client, req.user!.id, orderId, req.body));
      return res.status(200).json({ message, order });
    } catch (error) {
      return sendError(res, error, errorMessage);
    }
  };

export const decideOrderRoute = orderAction(
  (client, storeId, orderId, body) => decideOrder(client, storeId, orderId, body),
  "Order decision saved.",
  "An error occurred while saving the order decision.",
);

export const cancelOrderRoute = orderAction(
  (client, restaurantId, orderId) => cancelOrder(client, restaurantId, orderId),
  "Order cancelled.",
  "An error occurred while cancelling the order.",
);

export const completeOrderRoute = orderAction(
  (client, storeId, orderId) => completeOrder(client, storeId, orderId),
  "Order marked as picked up.",
  "An error occurred while confirming the pickup.",
);

export const cancelOverdueOrderRoute = orderAction(
  (client, storeId, orderId) => cancelOverdueOrder(client, storeId, orderId),
  "Overdue order cancelled.",
  "An error occurred while cancelling the order.",
);

// After a failed delivery: the restaurant picks the order up itself, or cancels it.
export const switchToPickupRoute = orderAction(
  (client, restaurantId, orderId, body) => switchToPickup(client, restaurantId, orderId, body.pickup_at),
  "Order switched to pickup.",
  "An error occurred while switching the order to pickup.",
);

export const cancelFailedDeliveryRoute = orderAction(
  (client, restaurantId, orderId) => cancelFailedDelivery(client, restaurantId, orderId),
  "Order cancelled.",
  "An error occurred while cancelling the order.",
);

// POST /orders/:id/problems: the order's restaurant reports a problem (services/orderProblems.ts).
export const reportProblemRoute = async (req: Request, res: Response) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  try {
    const problem = await inTransaction((client) => reportProblem(client, req.user!.id, orderId, req.body));
    return res.status(201).json({ message: "Problem reported.", problem });
  } catch (error) {
    return sendError(res, error, "An error occurred while reporting the problem.");
  }
};

// POST /orders/:id/courier-rating: the order's restaurant rates the courier (services/courierRatings.ts).
export const rateCourierRoute = async (req: Request, res: Response) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  try {
    const rating = await rateOrderCourier(req.user!.id, orderId, req.body);
    return res.status(201).json({ message: "Courier rated.", rating });
  } catch (error) {
    return sendError(res, error, "An error occurred while rating the courier.");
  }
};
