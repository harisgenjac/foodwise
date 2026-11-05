import type { Pool, PoolClient } from "pg";
import type { EmailLanguage, RenderedEmail } from "./layout.js";

export type Queryable = Pool | PoolClient;

export interface EmailTemplate {
  // Pure: the stored snapshot (email_queue.data) in the recipient's language. appUrl is the
  // frontend origin.
  render(data: unknown, lang: EmailLanguage, appUrl: string): RenderedEmail;
}

// The stored data does not fit the template; retrying would not help.
export class InvalidEmailDataError extends Error {
  constructor(template: string) {
    super(`The stored data does not match the ${template} email template.`);
  }
}
