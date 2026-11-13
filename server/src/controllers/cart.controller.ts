import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { parseId } from "../utils/params.js";
import {
  clearCart,
  clearUnavailableLines,
  countCartLines,
  deleteCartItem,
  getCart,
  parseCartItemBody,
  putCartItem,
} from "../services/cart.js";

// /api/cart (docs/orders-design.md, sections 4 and 10). RESTAURANT only (the routes check it);
// every success answers the whole cart, so the client never has to merge a line by itself.

const fail = (res: Response, error: unknown, message: string) => {
  if (error instanceof HttpError) return res.status(error.status).json(error.body());
  console.error(message, error);
  return res.status(500).json({ error: message });
};

const UPDATE_ERROR = "An error occurred while updating the cart.";

export const getCartRoute = async (req: Request, res: Response) => {
  try {
    const cart = await getCart(req.user!.id);
    return res.status(200).json({ message: "Cart fetched successfully.", cart });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching the cart.");
  }
};

export const getCartCountRoute = async (req: Request, res: Response) => {
  try {
    const count = await countCartLines(req.user!.id);
    return res.status(200).json({ message: "Cart fetched successfully.", count });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching the cart.");
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
    return fail(res, error, UPDATE_ERROR);
  }
};

export const deleteCartItemRoute = async (req: Request, res: Response) => {
  try {
    const productId = parseId(req.params.productId);
    if (productId === null) throw new HttpError(404, "This product is not in the cart.");
    const cart = await deleteCartItem(req.user!.id, productId);
    return res.status(200).json({ message: "Cart updated.", cart });
  } catch (error) {
    return fail(res, error, UPDATE_ERROR);
  }
};

export const clearCartRoute = async (req: Request, res: Response) => {
  try {
    const cart = await clearCart(req.user!.id);
    return res.status(200).json({ message: "Cart emptied.", cart });
  } catch (error) {
    return fail(res, error, UPDATE_ERROR);
  }
};

export const clearUnavailableRoute = async (req: Request, res: Response) => {
  try {
    const cart = await clearUnavailableLines(req.user!.id);
    return res.status(200).json({ message: "Cart updated.", cart });
  } catch (error) {
    return fail(res, error, UPDATE_ERROR);
  }
};
