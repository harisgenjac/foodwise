import type { Request, Response, NextFunction } from "express";

// CLIENT_ORIGIN may list several origins, comma-separated (for example a deployed frontend and a preview).
export const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The origin of a Referer URL, or null when it cannot be parsed.
const refererOrigin = (referer: string): string | null => {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

// Defence in depth against CSRF next to the sameSite "strict" auth cookie: a state-changing request
// sent by a browser from another site carries that site's Origin (or Referer) and is refused.
// Requests with neither header (non-browser clients, tests) are let through.
export const checkOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const referer = req.get("referer");
  const origin = req.get("origin") ?? (referer === undefined ? undefined : refererOrigin(referer));
  if (origin === undefined) return next();

  if (origin === null || !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Request origin not allowed." });
  }
  next();
};
