import type { Request, Response } from "express";
import pool from "../config/db.js";
import { FORGOT_PASSWORD_MESSAGE } from "../middleware/rateLimit.middleware.js";
import { logAccountEvent } from "../services/accountEvents.js";
import { sendPasswordResetLink } from "../services/accountEmails.js";
import { consumeToken, findValidToken, tokensInLastHour } from "../services/authTokens.js";
import { hashPassword, normalizeEmail, validateEmail, validatePassword } from "../utils/accounts.js";
import { createNotification } from "../utils/notifications.js";
import { clearSessionCookie, setSessionCookie } from "../utils/session.js";
import { notBlocked } from "../utils/visibility.js";

// Reset link requests per account per hour; more get the same answer and no email.
export const RESET_LINKS_PER_HOUR = 3;

const INVALID_LINK = "This link is invalid or has expired.";

// POST /api/auth/forgot-password { email }. The answer is always the same, whether the account
// exists, is blocked or has reached its limit, so it tells nobody which emails have accounts.
export const forgotPassword = async (req: Request, res: Response) => {
  const emailError = validateEmail(req.body.email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }
  let client;
  try {
    const found = await pool.query<{ id: number }>(
      `SELECT users.id FROM users WHERE LOWER(users.email) = $1 AND ${notBlocked("users")}`,
      [normalizeEmail(req.body.email)],
    );
    const user = found.rows[0];
    if (user && (await tokensInLastHour(pool, user.id, "PASSWORD_RESET")) < RESET_LINKS_PER_HOUR) {
      client = await pool.connect();
      await client.query("BEGIN");
      await sendPasswordResetLink(client, user.id);
      await logAccountEvent(client, { userId: user.id, event: "PASSWORD_RESET_REQUESTED", ip: req.ip ?? null });
      await client.query("COMMIT");
    }
    return res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while sending a password reset link:", error);
    return res.status(500).json({ error: "An error occurred while sending the link." });
  } finally {
    if (client) client.release();
  }
};

// POST /api/auth/reset-password/check { token }: whether a link still works, so the page can say
// so before the user types a password. Answers its purpose.
export const checkResetToken = async (req: Request, res: Response) => {
  try {
    const token = await findValidToken(pool, req.body.token);
    if (!token) {
      return res.status(400).json({ error: INVALID_LINK, code: "INVALID_LINK" });
    }
    return res.status(200).json({ message: "The link is valid.", purpose: token.purpose });
  } catch (error) {
    console.error("Error while checking a password link:", error);
    return res.status(500).json({ error: "An error occurred while checking the link." });
  }
};

// POST /api/auth/reset-password { token, password }: sets the password with an emailed link.
// Every session of the user is signed out (session_version + 1), the temporary password flag is
// cleared and the token is used up (and the user's other open ones revoked).
// - A reset link: the user gets an in-app notification with its email and logs in again.
// - An invitation: the user is signed in at once (a new session, last_login_at set) and goes on to
//   fill in the profile.
export const resetPassword = async (req: Request, res: Response) => {
  const passwordError = validatePassword(req.body.password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  let client;
  try {
    const passwordHash = await hashPassword(req.body.password);
    client = await pool.connect();
    await client.query("BEGIN");
    const token = await findValidToken(client, req.body.token, true);
    if (!token) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: INVALID_LINK, code: "INVALID_LINK" });
    }
    const invitation = token.purpose === "INVITATION";
    const updated = await client.query<{
      id: number;
      first_name: string | null;
      last_name: string | null;
      email: string;
      role: string;
      session_version: number;
    }>(
      `UPDATE users
       SET password_hash = $2, must_change_password = false, session_version = users.session_version + 1,
           last_login_at = CASE WHEN $3 THEN NOW() ELSE users.last_login_at END
       WHERE users.id = $1
       RETURNING users.id, users.first_name, users.last_name, users.email, users.role, users.session_version`,
      [token.user_id, passwordHash, invitation],
    );
    await consumeToken(client, token);
    if (!invitation) {
      await createNotification(client, {
        userId: token.user_id,
        type: "PASSWORD_CHANGED",
        message: "Your password was changed with a password reset link.",
      });
    }
    await logAccountEvent(client, {
      userId: token.user_id,
      event: invitation ? "INVITATION_ACCEPTED" : "PASSWORD_RESET",
      ip: req.ip ?? null,
    });
    await client.query("COMMIT");
    const user = updated.rows[0]!;
    if (invitation) {
      setSessionCookie(res, user);
      return res.status(200).json({
        message: "Your password was set. Welcome to FoodWise.",
        purpose: token.purpose,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          role: user.role,
          must_change_password: false,
        },
      });
    }
    // This browser's own session (if any) ended with the others.
    clearSessionCookie(res);
    return res.status(200).json({ message: "Your password was changed. You can log in now.", purpose: token.purpose });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while resetting a password:", error);
    return res.status(500).json({ error: "An error occurred while changing the password." });
  } finally {
    if (client) client.release();
  }
};
