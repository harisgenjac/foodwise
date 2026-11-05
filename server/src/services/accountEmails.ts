import type { PoolClient } from "pg";
import { enqueueEmail } from "../email/queue.js";
import { createAuthToken } from "./authTokens.js";

// The system emails with a one-time link: a new token (older open ones stop working) and its email
// in the caller's transaction. `adminId` is the admin who sent it, null when the user asked.

export const sendPasswordResetLink = async (client: PoolClient, userId: number, adminId: number | null = null) => {
  const token = await createAuthToken(client, userId, "PASSWORD_RESET", adminId);
  await enqueueEmail(client, { userId, template: "PASSWORD_RESET", data: { token } });
};

export const sendInvitation = async (client: PoolClient, userId: number, adminId: number) => {
  const token = await createAuthToken(client, userId, "INVITATION", adminId);
  await enqueueEmail(client, { userId, template: "INVITATION", data: { token } });
};
