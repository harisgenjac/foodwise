import type { Request, Response } from "express";
import { addStream, removeStream } from "../live/hub.js";

// A comment line keeps proxies and the browser from closing an idle stream.
const HEARTBEAT_MS = 25_000;
// How long the browser waits before reconnecting a dropped stream.
const RETRY_MS = 10_000;
// setTimeout's limit (about 24.8 days).
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// GET /api/events: a Server-Sent Events stream of the caller's live events (see live/hub.ts).
// The first event is `ready`. The stream ends when the login token expires, so a logged-out
// browser stops receiving events; its reconnect then gets 401.
export const streamEvents = (req: Request, res: Response) => {
  const userId = req.user!.id;
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // nginx and similar proxies would otherwise buffer the stream.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`retry: ${RETRY_MS}\n\nevent: ready\ndata: {}\n\n`);
  addStream(userId, res);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  const expiresAt = typeof req.user!.exp === "number" ? req.user!.exp * 1000 : null;
  const expiry =
    expiresAt === null ? null : setTimeout(() => res.end(), Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT_MS));

  const close = () => {
    clearInterval(heartbeat);
    if (expiry) clearTimeout(expiry);
    removeStream(userId, res);
  };
  // "close" fires when either side ends the stream (the browser tab, the expiry, the per-user cap).
  res.on("close", close);
};
