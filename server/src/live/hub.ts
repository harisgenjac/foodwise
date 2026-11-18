import type { Response } from "express";

// What the open streams receive. An event names what changed, never its content: the page loads
// that through the API, which checks access as usual.
// - order: an order, one of its items or its delivery changed (to the order's store and restaurant)
// - notification: the user got a new notification
// - resync: events may have been missed (the database listener reconnected), so reload everything
export type LiveEvent = { kind: "order"; order_id: number } | { kind: "notification" } | { kind: "resync" };

// A user's tabs each hold one stream; past this many the oldest is closed (the browser of a closed
// tab that never said goodbye, or a misbehaving client).
export const MAX_STREAMS_PER_USER = 10;

// The open streams of this server process, by user id.
const streams = new Map<number, Set<Response>>();

const format = (event: LiveEvent) => `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;

export const addStream = (userId: number, res: Response) => {
  let userStreams = streams.get(userId);
  if (!userStreams) {
    userStreams = new Set();
    streams.set(userId, userStreams);
  }
  if (userStreams.size >= MAX_STREAMS_PER_USER) {
    const oldest = userStreams.values().next().value!;
    userStreams.delete(oldest);
    oldest.end();
  }
  userStreams.add(res);
};

export const removeStream = (userId: number, res: Response) => {
  const userStreams = streams.get(userId);
  if (!userStreams) return;
  userStreams.delete(res);
  if (userStreams.size === 0) streams.delete(userId);
};

export const sendToUsers = (userIds: Iterable<number>, event: LiveEvent) => {
  const message = format(event);
  for (const userId of new Set(userIds)) {
    for (const res of streams.get(userId) ?? []) res.write(message);
  }
};

export const sendToAll = (event: LiveEvent) => {
  const message = format(event);
  for (const userStreams of streams.values()) {
    for (const res of userStreams) res.write(message);
  }
};
