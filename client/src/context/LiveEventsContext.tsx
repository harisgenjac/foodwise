import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { API_ORIGIN } from "../api/axios.js";

// The server's live events (GET /api/events, Server-Sent Events). An event only says what
// changed; a page that shows it loads it again through the API.
// - order: an order of the user (its items or its delivery) changed
// - notification: the user got a new notification
// - resync: events may have been missed (the stream reconnected), so reload what is shown
export type LiveEvent = { kind: "order"; order_id: number } | { kind: "notification" } | { kind: "resync" };

type Listener = (event: LiveEvent) => void;

interface LiveEventsContextType {
  subscribe: (listener: Listener) => () => void;
}

const LiveEventsContext = createContext<LiveEventsContextType | null>(null);

const KINDS = ["order", "notification", "resync"] as const;
// The browser reconnects a dropped stream by itself (after the server's `retry`); a refused one
// (an expired login, the server down at the start) is tried again after this.
export const LIVE_RETRY_MS = 30000;

// One stream per tab for the whole app. `enabled` false (a user who must first replace a temporary
// password, whom the server answers 403) opens nothing. Without EventSource nothing is live and the
// pages still load on their own.
export const LiveEventsProvider = ({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) => {
  const listenersRef = useRef(new Set<Listener>());

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const emit = (event: LiveEvent) => {
      for (const listener of [...listenersRef.current]) listener(event);
    };
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let openedBefore = false;

    const open = () => {
      const current = new EventSource(`${API_ORIGIN}/api/events`, { withCredentials: true });
      source = current;
      current.addEventListener("open", () => {
        // A reconnect: whatever changed while the stream was down was not sent.
        if (openedBefore) emit({ kind: "resync" });
        openedBefore = true;
      });
      for (const kind of KINDS) {
        current.addEventListener(kind, (message) => {
          try {
            emit(JSON.parse((message as MessageEvent<string>).data) as LiveEvent);
          } catch {
            // A malformed event is dropped.
          }
        });
      }
      current.addEventListener("error", () => {
        if (current.readyState !== EventSource.CLOSED) return;
        current.close();
        retryTimer = setTimeout(open, LIVE_RETRY_MS);
      });
    };

    open();
    return () => {
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled]);

  const value = useMemo<LiveEventsContextType>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
    }),
    [],
  );

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
};

// Calls `listener` with every live event while the component is mounted (nothing outside the
// provider). The latest `listener` is used, so it need not be memoized.
export const useLiveEvents = (listener: Listener) => {
  const context = useContext(LiveEventsContext);
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => {
    if (!context) return;
    const unsubscribe = context.subscribe((event) => listenerRef.current(event));
    return () => {
      unsubscribe();
    };
  }, [context]);
};

// Events that arrive close together (an action of the user's own, which also returns the new
// state, or a decision with its notification) load the page once.
export const LIVE_REFRESH_DELAY_MS = 300;

// Loads an order page again when one of the user's orders changes (only `orderId` when given) or
// after a reconnect.
export const useLiveOrderRefresh = (refresh: () => void, orderId?: number) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  useLiveEvents((event) => {
    const relevant =
      event.kind === "resync" || (event.kind === "order" && (orderId === undefined || event.order_id === orderId));
    if (!relevant) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(refresh, LIVE_REFRESH_DELAY_MS);
  });
};
