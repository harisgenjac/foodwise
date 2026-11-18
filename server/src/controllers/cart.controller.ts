import type { Request, Response } from "express";
import pool from "../config/db.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { parseId } from "../utils/params.js";
import {
  clearCart,
  clearUnavailableLines,
  deleteCartItem,
  getCart,
  parseCartItemBody,
  putCartItem,
} from "../services/cart.js";
import { quoteDelivery } from "../services/deliveryQuote.js";

// /api/cart (docs/product.md). RESTAURANT only (the routes check it);
// every success answers the whole cart, so the client never has to merge a line by itself.

const UPDATE_ERROR = "An error occurred while updating the cart.";

export const getCartRoute = async (req: Request, res: Response) => {
  try {
    const cart = await getCart(req.user!.id);
    return res.status(200).json({ message: "Cart fetched successfully.", cart });
  } catch (error) {
    return sendError(res, error, "An error occurred while fetching the cart.");
  }
};

// The cart's delivery choice: whether its store can deliver to the restaurant now, and the
// provider's estimate for what would be sent (price, courier pickup and delivery time).
export const getCartDeliveryRoute = async (req: Request, res: Response) => {
  try {
    const cart = await getCart(req.user!.id);
    if (!cart.store) throw new HttpError(400, "The cart is empty.");
    const option = await quoteDelivery(pool, cart.store.id, req.user!.id, Number(cart.totals.total));
    const delivery = option.available ? { available: true, ...option.estimate } : option;
    return res.status(200).json({ message: "Delivery checked.", delivery });
  } catch (error) {
    return sendError(res, error, "An error occurred while checking delivery.");
  }
};

export const putCartItemRoute = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.productId);
    if (productId === null) throw new HttpError(404, "Product not found.");
    const input = parseCartItemBody(req.body);
    const cart = await inTransaction((client) => putCartItem(client, req.user!.id, productId, input));
    return res.status(200).json({ message: "Cart updated.", cart });
  } catch (error) {
    return sendError(res, error, UPDATE_ERROR);
  }
};

export const deleteCartItemRoute = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.productId);
    if (productId === null) throw new HttpError(404, "This product is not in the cart.");
    const cart = await deleteCartItem(req.user!.id, productId);
    return res.status(200).json({ message: "Cart updated.", cart });
  } catch (error) {
    return sendError(res, error, UPDATE_ERROR);
  }
};

export const clearCartRoute = async (req: Request, res: Response) => {
  try {
    const cart = await clearCart(req.user!.id);
    return res.status(200).json({ message: "Cart emptied.", cart });
  } catch (error) {
    return sendError(res, error, UPDATE_ERROR);
  }
};

export const clearUnavailableRoute = async (req: Request, res: Response) => {
  try {
    const cart = await clearUnavailableLines(req.user!.id);
    return res.status(200).json({ message: "Cart updated.", cart });
  } catch (error) {
    return sendError(res, error, UPDATE_ERROR);
  }
};
