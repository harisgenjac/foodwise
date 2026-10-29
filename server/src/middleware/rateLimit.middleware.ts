import { rateLimit, ipKeyGenerator, MemoryStore, MINUTE, HOUR } from "express-rate-limit";
import type { Request, Response } from "express";
import { normalizeEmail } from "../utils/accounts.js";

export type RateLimits = {
  api: number; // per IP, every 15 minutes
  login: number; // failed logins per IP and email, every 15 minutes
  password: number; // password changes and resets per user, every 15 minutes
  upload: number; // logo uploads and CSV imports per user, every hour
};

// The app polls notifications every 50 s and a page loads several endpoints at once, so the
// general limit stays far above normal use.
export const DEFAULT_RATE_LIMITS: RateLimits = { api: 1000, login: 10, password: 10, upload: 30 };

const ip = (req: Request) => ipKeyGenerator(req.ip ?? "");
// Behind authenticate, so the user is known; the IP is only a fallback.
const userKey = (req: Request) => (req.user ? `user:${req.user.id}` : ip(req));
const loginKey = (req: Request) => {
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  return `${ip(req)}:${email}`;
};

const tooMany = (_req: Request, res: Response) =>
  res.status(429).json({ error: "Too many requests. Please try again later." });

// The stores are kept, so tests can start every case with empty counters.
export const createRateLimiters = (limits: RateLimits, enabled: boolean) => {
  const stores: MemoryStore[] = [];
  const limiter = (
    identifier: string,
    windowMs: number,
    limit: number,
    keyGenerator: (req: Request) => string,
    skipSuccessfulRequests = false,
  ) => {
    const store = new MemoryStore();
    stores.push(store);
    return rateLimit({
      windowMs,
      limit,
      keyGenerator,
      skipSuccessfulRequests,
      store,
      identifier,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: tooMany,
      skip: () => !enabled,
    });
  };

  return {
    api: limiter("api", 15 * MINUTE, limits.api, ip),
    // Only failed attempts count: a successful login gives its slot back.
    login: limiter("login", 15 * MINUTE, limits.login, loginKey, true),
    password: limiter("password", 15 * MINUTE, limits.password, userKey),
    upload: limiter("upload", HOUR, limits.upload, userKey),
    reset: () => Promise.all(stores.map((store) => store.resetAll())),
  };
};

// The limits are off under Vitest (NODE_ENV=test), so the other test files never hit them;
// tests/rateLimit.test.ts swaps in low, enabled limiters.
export const rateLimiters = createRateLimiters(DEFAULT_RATE_LIMITS, process.env.NODE_ENV !== "test");
