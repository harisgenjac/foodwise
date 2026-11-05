// Mailpit catches every email the e2e server sends (EMAIL_PROVIDER=smtp, see docs/e2e.md); the
// tests read them through its REST API. MAILPIT_URL is its web/API address, e.g. http://localhost:8025.
import { expect } from "@playwright/test";

export const MAILPIT_URL = process.env.MAILPIT_URL?.trim().replace(/\/+$/, "") || null;

interface Address {
  Name: string;
  Address: string;
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  From: Address;
  To: Address[];
  Text: string;
  HTML: string;
}

const mailpit = async <T>(path: string): Promise<T> => {
  if (!MAILPIT_URL) throw new Error("MAILPIT_URL is not set (see docs/e2e.md).");
  const response = await fetch(`${MAILPIT_URL}${path}`);
  expect(response.ok, `Mailpit ${path} → ${response.status}`).toBe(true);
  return (await response.json()) as T;
};

// Waits for exactly one email matching a Mailpit search (e.g. `to:x@y subject:"Nova rezervacija"`)
// and returns it in full. The server's email worker sends every 5 seconds.
export const waitForEmail = async (query: string): Promise<MailpitMessage> => {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const { messages } = await mailpit<{ messages: { ID: string }[] }>(
          `/api/v1/search?query=${encodeURIComponent(query)}`,
        );
        id = messages[0]?.ID;
        return messages.length;
      },
      { message: `one email in Mailpit for ${query}`, timeout: 30_000 },
    )
    .toBe(1);
  return mailpit<MailpitMessage>(`/api/v1/message/${id}`);
};
