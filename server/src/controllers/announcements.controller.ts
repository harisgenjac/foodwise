import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";

// The audience a user belongs to: a company's headquarters gets the store announcements.
const MEANT_FOR_USER = `(announcements.audience = 'ALL'
  OR announcements.audience::text = CASE WHEN users.role = 'COMPANY' THEN 'STORE' ELSE users.role::text END)`;

// An announcement is shown to a role when it targets everyone or that role, has not been ended or
// expired, and was sent after the account existed (a new account does not get old news).
const VISIBLE_TO_USER = `
  announcements.ended_at IS NULL
  AND (announcements.expires_at IS NULL OR announcements.expires_at > NOW())
  AND ${MEANT_FOR_USER}
  AND announcements.created_at >= users.created_at`;

export const getActiveAnnouncements = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT announcements.id, announcements.title_bs, announcements.body_bs,
         announcements.title_en, announcements.body_en, announcements.created_at
       FROM announcements
       JOIN users ON users.id = $1
       WHERE ${VISIBLE_TO_USER}
         AND NOT EXISTS (
           SELECT 1 FROM announcement_dismissals
           WHERE announcement_dismissals.announcement_id = announcements.id
             AND announcement_dismissals.user_id = $1
         )
       ORDER BY announcements.created_at DESC, announcements.id DESC`,
      [req.user!.id],
    );
    return res.status(200).json({ announcements: result.rows });
  } catch (error) {
    console.error("Error while fetching announcements:", error);
    return res.status(500).json({ error: "An error occurred while fetching announcements." });
  }
};

export const dismissAnnouncement = async (req: Request, res: Response) => {
  const announcementId = parseId(req.params.id);
  if (announcementId === null) {
    return res.status(404).json({ error: "Announcement not found." });
  }
  try {
    const visible = await pool.query(
      `SELECT announcements.id FROM announcements
       JOIN users ON users.id = $2
       WHERE announcements.id = $1
         AND ${MEANT_FOR_USER}`,
      [announcementId, req.user!.id],
    );
    if (visible.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found." });
    }
    // Dismissing twice is harmless.
    await pool.query(
      `INSERT INTO announcement_dismissals (announcement_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [announcementId, req.user!.id],
    );
    return res.status(200).json({ message: "Announcement dismissed." });
  } catch (error) {
    console.error("Error while dismissing announcement:", error);
    return res.status(500).json({ error: "An error occurred while dismissing the announcement." });
  }
};
