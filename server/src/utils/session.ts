import jwt from "jsonwebtoken";
import type { Response } from "express";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
};
const SESSION_DAYS = 7;

// Signs the user in: a 7-day JWT in the httpOnly `token` cookie. The token carries the user's
// session_version (`sv`); raising it in the database (a password reset) ends every session signed
// before, because authenticate compares the two on every request.
export const setSessionCookie = (res: Response, user: { id: number; role: string; session_version: number }) => {
  const token = jwt.sign({ id: user.id, role: user.role, sv: user.session_version }, process.env.JWT_SECRET!, {
    expiresIn: `${SESSION_DAYS}d`,
  });
  res.cookie("token", token, { ...COOKIE_OPTIONS, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
};

export const clearSessionCookie = (res: Response) => {
  res.clearCookie("token", COOKIE_OPTIONS);
};
