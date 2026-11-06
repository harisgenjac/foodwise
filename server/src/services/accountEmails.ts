import type { PoolClient } from "pg";
import { enqueueEmail } from "../email/queue.js";
import type { InvitationSender } from "../email/templates/systemEmails.js";
import { createAuthToken } from "./authTokens.js";

// The system emails with a one-time link: a new token (older open ones stop working) and its email
// in the caller's transaction. `senderId` is the admin (or headquarters) who sent it, null when the
// user asked.

export const sendPasswordResetLink = async (client: PoolClient, userId: number, senderId: number | null = null) => {
  const token = await createAuthToken(client, userId, "PASSWORD_RESET", senderId);
  await enqueueEmail(client, { userId, template: "PASSWORD_RESET", data: { token } });
};

// `sender` picks the wording: the platform administrator, or the company's headquarters that
// opened a branch login.
export const sendInvitation = async (
  client: PoolClient,
  userId: number,
  senderId: number,
  sender: InvitationSender = "ADMIN",
) => {
  const token = await createAuthToken(client, userId, "INVITATION", senderId);
  await enqueueEmail(client, { userId, template: "INVITATION", data: { token, sender } });
};
