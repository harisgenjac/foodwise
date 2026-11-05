import type { Pool, PoolClient } from "pg";

// What users do to their own account without an admin (admin_actions keeps only admin actions).
// The admin's user page lists them as the account's activity.
export type AccountEvent = "PASSWORD_RESET_REQUESTED" | "PASSWORD_RESET" | "INVITATION_ACCEPTED";

export const logAccountEvent = async (
  db: Pool | PoolClient,
  { userId, event, ip = null }: { userId: number; event: AccountEvent; ip?: string | null },
) => {
  await db.query(`INSERT INTO account_events (user_id, event, ip) VALUES ($1, $2, $3)`, [
    userId,
    event,
    ip ? ip.slice(0, 64) : null,
  ]);
};
