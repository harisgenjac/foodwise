import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import pool from "../config/db.js";
import type { AuthUser, Role } from "../types/auth.js";

// The token proves who the caller is; the role and the blocked flag are read from the
// database on every request, so blocking an account or changing its role applies at once.
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Niste prijavljeni." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    return res.status(401).json({ error: "Token je nevažeći ili je istekao." });
  }
  if (typeof decoded === "string") {
    return res.status(401).json({ error: "Nevažeći token" });
  }

  try {
    const result = await pool.query<{ role: Role; is_blocked: boolean }>(
      "SELECT users.role, users.is_blocked FROM users WHERE users.id = $1",
      [decoded.id],
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Token je nevažeći ili je istekao." });
    }
    if (user.is_blocked) {
      return res.status(401).json({ error: "Vaš nalog je blokiran." });
    }
    req.user = { ...decoded, id: decoded.id, role: user.role } as AuthUser;
    next();
  } catch (error) {
    console.error("Greška prilikom provjere korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške na serveru." });
  }
};

export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user!.role;

    if (!allowedRoles.includes(role)) {
      return res
        .status(403)
        .json({ error: "Nemate odgovarajuću rolu za ovu akciju." });
    }
    next();
  };
};
