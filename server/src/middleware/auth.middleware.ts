import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import pool from "../config/db.js";
import type { AuthUser, Role } from "../types/auth.js";

// What a user with a temporary password (set by an admin) may still call: their profile, so they
// can fill it in, and the password change itself.
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set([
  "GET /api/auth/me",
  "GET /api/users/me",
  "PUT /api/users/me",
  "POST /api/users/me/logo",
  "PUT /api/users/me/password",
]);

// The token proves who the caller is; the role and the blocked flag are read from the
// database on every request, so blocking an account or changing its role applies at once.
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "You are not logged in." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    return res.status(401).json({ error: "Token is invalid or has expired." });
  }
  if (typeof decoded === "string") {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const result = await pool.query<{ role: Role; is_blocked: boolean; must_change_password: boolean }>(
      "SELECT users.role, users.is_blocked, users.must_change_password FROM users WHERE users.id = $1",
      [decoded.id],
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Token is invalid or has expired." });
    }
    if (user.is_blocked) {
      return res.status(401).json({ error: "Your account is blocked." });
    }
    const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
    if (user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(route)) {
      return res.status(403).json({ error: "You must change your password before continuing." });
    }
    req.user = { ...decoded, id: decoded.id, role: user.role } as AuthUser;
    next();
  } catch (error) {
    console.error("Error while verifying user:", error);
    return res.status(500).json({ error: "A server error occurred." });
  }
};

export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user!.role;

    if (!allowedRoles.includes(role)) {
      return res
        .status(403)
        .json({ error: "You do not have the required role for this action." });
    }
    next();
  };
};
