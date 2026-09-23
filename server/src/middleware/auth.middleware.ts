import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser, Role } from "../types/auth.js";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Niste prijavljeni." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded === "string") {
      return res.status(401).json({ error: "Nevažeći token" });
    }
    req.user = decoded as AuthUser;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token je nevažeći ili je istekao." });
  }
};

export const authorize = (allowedRole: Role) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user!.role;

    if (role !== allowedRole) {
      return res
        .status(403)
        .json({ error: "Nemate odgovarajuću rolu za ovu akciju." });
    }
    next();
  };
};
