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
