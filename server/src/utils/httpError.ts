import type { Response } from "express";

// An error that carries the HTTP status the global error handler should answer with, plus
// optional extra fields for the response body next to `error` (e.g. a machine-readable code).
export class HttpError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }

  // The JSON body: always `{ error }` (the API rule), with the details alongside it.
  body() {
    return { error: this.message, ...this.details };
  }
}

// The answer to an error caught in a route: an HttpError with its own status and body, anything
// else a 500 with `message`, logged under `log` (the message itself by default).
export const sendError = (res: Response, error: unknown, message: string, log = message) => {
  if (error instanceof HttpError) return res.status(error.status).json(error.body());
  console.error(log, error);
  return res.status(500).json({ error: message });
};
