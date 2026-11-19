import pkg from "pg";
import { sendToAll, sendToUsers, type LiveEvent } from "./hub.js";

const { Client } = pkg;

// The channel the live event triggers (notify_order_change, notify_new_notification) notify on.
const LIVE_CHANNEL = "live_events";

// The listener's connection shows under this name in pg_stat_activity.
export const LIVE_APPLICATION_NAME = "josvrijedi-live-events";

interface Routed {
  userIds: number[];
  event: LiveEvent;
}

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

// A trigger's payload, e.g. {"kind":"order","order_id":7,"user_ids":[3,5]}. Anything else is
// dropped (null).
export const parseLiveEvent = (payload: string | undefined): Routed | null => {
  let data: unknown;
  try {
    data = JSON.parse(payload ?? "");
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { kind, order_id: orderId, user_ids: userIds } = data as Record<string, unknown>;
  if (!Array.isArray(userIds) || !userIds.every(isId)) return null;
  if (kind === "order" && isId(orderId)) return { userIds, event: { kind: "order", order_id: orderId } };
  if (kind === "notification") return { userIds, event: { kind: "notification" } };
  return null;
};

export interface LiveListener {
  // Resolves once the first LISTEN is in place (tests wait for it).
  ready: Promise<void>;
  stop: () => Promise<void>;
}

// One dedicated connection (not from the pool: a LISTEN must stay on its connection) passes the
// database's events to this process's open streams, so it works the same with several server
// instances. A lost connection is retried every 5 s (`retryMs`); after a reconnect every stream gets `resync`,
// because events of the gap are lost.
export const startLiveListener = ({
  connectionString = process.env.DATABASE_URL,
  retryMs = 5000,
}: { connectionString?: string; retryMs?: number } = {}): LiveListener => {
  let stopped = false;
  let client: InstanceType<typeof Client> | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let connectedBefore = false;
  let markReady: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, retryMs);
  };

  const connect = async () => {
    const current = new Client({ connectionString, application_name: LIVE_APPLICATION_NAME });
    client = current;
    // An error or end after connecting (the database restarted): drop this client and retry.
    const lost = (error?: Error) => {
      if (client !== current) return;
      client = null;
      current.removeAllListeners();
      // A late error from the closing connection must not crash the process.
      current.on("error", () => {});
      current.end().catch(() => {});
      if (!stopped) {
        console.error("Live events: database connection lost, retrying.", error?.message ?? "");
        scheduleRetry();
      }
    };
    current.on("error", lost);
    current.on("end", () => lost());
    current.on("notification", (message) => {
      if (message.channel !== LIVE_CHANNEL) return;
      const routed = parseLiveEvent(message.payload);
      if (routed) sendToUsers(routed.userIds, routed.event);
    });
    try {
      await current.connect();
      await current.query(`LISTEN ${LIVE_CHANNEL}`);
    } catch (error) {
      lost(error as Error);
      return;
    }
    if (stopped) {
      await current.end().catch(() => {});
      return;
    }
    if (connectedBefore) sendToAll({ kind: "resync" });
    connectedBefore = true;
    markReady();
  };

  void connect();

  return {
    ready,
    stop: async () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      const current = client;
      client = null;
      if (current) {
        current.removeAllListeners();
        current.on("error", () => {});
        await current.end().catch(() => {});
      }
    },
  };
};
