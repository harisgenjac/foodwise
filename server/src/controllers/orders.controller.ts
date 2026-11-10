import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { HttpError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { parseId } from "../utils/params.js";
import { parseSendOrderBody, sendOrder } from "../services/orders/send.js";
import { decideOrder } from "../services/orders/decision.js";
import { cancelOrder, cancelOverdueOrder, completeOrder } from "../services/orders/actions.js";
import {
  countPickupOrders,
  getOrderDetails,
  listMineOrders,
  listPickupOrders,
  listStoreOrders,
  summarizeMineOrders,
} from "../services/orders/queries.js";

// /api/orders (docs/orders-design.md, section 10). The order service throws an HttpError for
// every refusal; anything else is logged and answered with 500.

const fail = (res: Response, error: unknown, log: string, message: string) => {
  if (error instanceof HttpError) return res.status(error.status).json(error.body());
  console.error(log, error);
  return res.status(500).json({ error: message });
};

const FETCH_ERROR = "An error occurred while fetching orders.";

export const createOrder = async (req: Request, res: Response) => {
  try {
    const input = parseSendOrderBody(req.body);
    const sent = await inTransaction((client) => sendOrder(client, req.user!.id, input));
    return res.status(201).json({ message: "Order sent.", order: { ...sent.order, items: sent.items }, changes: sent.changes });
  } catch (error) {
    return fail(res, error, "Error while sending order:", "An error occurred while sending the order.");
  }
};

export const getMineOrders = async (req: Request, res: Response) => {
  try {
    const result = await listMineOrders(req.user!.id, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", ...result });
  } catch (error) {
    return fail(res, error, "Error while fetching orders:", FETCH_ERROR);
  }
};

export const getMineOrdersSummary = async (req: Request, res: Response) => {
  try {
    const summary = await summarizeMineOrders(req.user!.id, req.query);
    if (!summary) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", summary });
  } catch (error) {
    return fail(res, error, "Error while fetching orders:", FETCH_ERROR);
  }
};

export const getStoreOrders = async (req: Request, res: Response) => {
  try {
    const result = await listStoreOrders(req.user!.id, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Orders fetched successfully.", ...result });
  } catch (error) {
    return fail(res, error, "Error while fetching orders:", FETCH_ERROR);
  }
};

export const getOrderPickups = async (req: Request, res: Response) => {
  try {
    const result = await listPickupOrders(req.user!.id, req.user!.role, req.query);
    if (!result) return res.status(400).json({ error: "Invalid filter." });
    return res.status(200).json({ message: "Pickups fetched successfully.", ...result });
  } catch (error) {
    return fail(res, error, "Error while fetching pickups:", "An error occurred while fetching pickups.");
  }
};

export const getOrderPickupCounts = async (req: Request, res: Response) => {
  try {
    const counts = await countPickupOrders(req.user!.id, req.user!.role);
    return res.status(200).json({ message: "Pickups fetched successfully.", counts });
  } catch (error) {
    return fail(res, error, "Error while fetching pickups:", "An error occurred while fetching pickups.");
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
    return fail(res, error, "Error while fetching order:", FETCH_ERROR);
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
      return fail(res, error, `${errorMessage}:`, `An error occurred while ${errorMessage.toLowerCase()}.`);
    }
  };

export const decideOrderRoute = orderAction(
  (client, storeId, orderId, body) => decideOrder(client, storeId, orderId, body),
  "Order decision saved.",
  "Saving the order decision",
);

export const cancelOrderRoute = orderAction(
  (client, restaurantId, orderId) => cancelOrder(client, restaurantId, orderId),
  "Order cancelled.",
  "Cancelling the order",
);

export const completeOrderRoute = orderAction(
  (client, storeId, orderId) => completeOrder(client, storeId, orderId),
  "Order marked as picked up.",
  "Confirming the pickup",
);

export const cancelOverdueOrderRoute = orderAction(
  (client, storeId, orderId) => cancelOverdueOrder(client, storeId, orderId),
  "Overdue order cancelled.",
  "Cancelling the order",
);
