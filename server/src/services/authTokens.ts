import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { notBlocked } from "../utils/visibility.js";

// One-time links sent by email (password reset). The raw token exists only in the email: the
// database keeps its SHA-256 hash. A token is valid until it expires, can be used once, and a new
// token for the same user revokes every older open one.

export type TokenPurpose = "PASSWORD_RESET";

export const TOKEN_LIFETIME_MINUTES: Record<TokenPurpose, number> = {
  PASSWORD_RESET: 60,
};

// Where each link points on the frontend (the token goes in the query string).
export const TOKEN_PAGES: Record<TokenPurpose, string> = {
  PASSWORD_RESET: "/reset-password",
};

type Db = Pool | PoolClient;

// 32 random bytes, URL-safe (43 characters).
const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Creates a token for the user and returns the raw value (to put in the email). Older open
// tokens of the user, of any purpose, stop working.
export const createAuthToken = async (
  db: Db,
  userId: number,
  purpose: TokenPurpose,
  createdBy: number | null = null,
): Promise<string> => {
  const token = newToken();
  await db.query(
    `UPDATE auth_tokens SET revoked_at = NOW()
     WHERE auth_tokens.user_id = $1 AND auth_tokens.used_at IS NULL AND auth_tokens.revoked_at IS NULL`,
    [userId],
  );
  await db.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, NOW() + make_interval(mins => $4), $5)`,
    [userId, purpose, hashToken(token), TOKEN_LIFETIME_MINUTES[purpose], createdBy],
  );
  return token;
};

export interface ValidToken {
  id: number;
  user_id: number;
  purpose: TokenPurpose;
  email: string;
}

// The token's row when it can still be used: not used, not revoked, not expired, and its user is
// not blocked (also a blocked company or a deactivated branch). `lock` takes the row lock for
// the transaction that uses it, so a token cannot be used twice at the same moment.
export const findValidToken = async (db: Db, token: unknown, lock = false): Promise<ValidToken | null> => {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return null;
  const result = await db.query<ValidToken>(
    `SELECT auth_tokens.id, auth_tokens.user_id, auth_tokens.purpose, users.email
     FROM auth_tokens
     JOIN users ON users.id = auth_tokens.user_id
     WHERE auth_tokens.token_hash = $1
       AND auth_tokens.used_at IS NULL AND auth_tokens.revoked_at IS NULL
       AND auth_tokens.expires_at > NOW()
       AND ${notBlocked("users")}
     ${lock ? "FOR UPDATE OF auth_tokens" : ""}`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
};

// Marks the token used and revokes the user's other open tokens.
export const consumeToken = async (db: Db, token: ValidToken) => {
  await db.query(`UPDATE auth_tokens SET used_at = NOW() WHERE auth_tokens.id = $1`, [token.id]);
  await db.query(
    `UPDATE auth_tokens SET revoked_at = NOW()
     WHERE auth_tokens.user_id = $1 AND auth_tokens.id <> $2
       AND auth_tokens.used_at IS NULL AND auth_tokens.revoked_at IS NULL`,
    [token.user_id, token.id],
  );
};

// How many tokens of a purpose the user got in the last hour (the per-email limit).
export const tokensInLastHour = async (db: Db, userId: number, purpose: TokenPurpose): Promise<number> => {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM auth_tokens
     WHERE auth_tokens.user_id = $1 AND auth_tokens.purpose = $2
       AND auth_tokens.created_at > NOW() - interval '1 hour'`,
    [userId, purpose],
  );
  return Number(result.rows[0]!.count);
};
