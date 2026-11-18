import pool from "../config/db.js";
import type { Request, Response } from "express";
import { notifyAnnouncement } from "../utils/notifications.js";
import { parseId } from "../utils/params.js";
import { ADMIN_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { isValidDateTime } from "../utils/dates.js";
import { logAdminAction } from "./admin.controller.js";

// Platform announcements (/api/admin/announcements): an admin sends one to stores, restaurants or
// both as a notification, lists them and ends one early.

const ANNOUNCEMENT_AUDIENCES = ["ALL", "STORE", "RESTAURANT"];
const MAX_ANNOUNCEMENT_TITLE = 120;
const MAX_ANNOUNCEMENT_BODY = 1000;

const ANNOUNCEMENT_COLUMNS = `announcements.id, announcements.audience, announcements.title_bs,
  announcements.body_bs, announcements.title_en, announcements.body_en, announcements.expires_at,
  announcements.ended_at, announcements.created_at`;

// Validates and trims an announcement; English is optional but needs both a title and a body.
const parseAnnouncement = (body: Record<string, unknown>) => {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const audience = body.audience;
  const fields = {
    title_bs: text(body.title_bs),
    body_bs: text(body.body_bs),
    title_en: text(body.title_en),
    body_en: text(body.body_en),
  };
  if (typeof audience !== "string" || !ANNOUNCEMENT_AUDIENCES.includes(audience)) {
    return { error: "Audience is not valid." };
  }
  if (!fields.title_bs || !fields.body_bs) {
    return { error: "Title and text are required." };
  }
  if (Boolean(fields.title_en) !== Boolean(fields.body_en)) {
    return { error: "For the English translation, enter both the title and the text." };
  }
  if (fields.title_bs.length > MAX_ANNOUNCEMENT_TITLE || fields.title_en.length > MAX_ANNOUNCEMENT_TITLE) {
    return { error: `Title can be at most ${MAX_ANNOUNCEMENT_TITLE} characters long.` };
  }
  if (fields.body_bs.length > MAX_ANNOUNCEMENT_BODY || fields.body_en.length > MAX_ANNOUNCEMENT_BODY) {
    return { error: `Text can be at most ${MAX_ANNOUNCEMENT_BODY} characters long.` };
  }
  let expiresAt: string | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    if (!isValidDateTime(body.expires_at) || new Date(body.expires_at as string).getTime() <= Date.now()) {
      return { error: "Expiry date must be in the future." };
    }
    expiresAt = body.expires_at as string;
  }
  return { announcement: { ...fields, audience, expires_at: expiresAt } };
};

// Sends the announcement to every unblocked store and/or restaurant as a notification, in one
// statement; admins never receive it.
export const createAnnouncement = async (req: Request, res: Response) => {
  const parsed = parseAnnouncement(req.body);
  if (!parsed.announcement) {
    return res.status(400).json({ error: parsed.error });
  }
  const fields = parsed.announcement;
  // A company's headquarters belongs to the store side, so it gets store announcements too.
  const roles =
    fields.audience === "ALL"
      ? ["STORE", "RESTAURANT", "COMPANY"]
      : fields.audience === "STORE"
        ? ["STORE", "COMPANY"]
        : [fields.audience];

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO announcements (admin_id, audience, title_bs, body_bs, title_en, body_en, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ANNOUNCEMENT_COLUMNS}`,
      [
        req.user!.id,
        fields.audience,
        fields.title_bs,
        fields.body_bs,
        fields.title_en || null,
        fields.body_en || null,
        fields.expires_at,
      ],
    );
    const announcement = result.rows[0];
    const recipients = await notifyAnnouncement(
      client,
      announcement.id,
      `Platform announcement: ${fields.title_en || fields.title_bs}`,
      roles,
    );
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "CREATE_ANNOUNCEMENT",
      targetAnnouncementId: announcement.id,
    });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Announcement sent.", announcement, recipients });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while sending announcement:", error);
    return res.status(500).json({ error: "An error occurred while sending the announcement." });
  } finally {
    if (client) client.release();
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const { rows, total } = await listPage(
      `${ANNOUNCEMENT_COLUMNS}, admins.email AS admin_email,
       announcements.ended_at IS NULL
         AND (announcements.expires_at IS NULL OR announcements.expires_at > NOW()) AS is_active,
       (SELECT COUNT(*) FROM notifications
        WHERE notifications.announcement_id = announcements.id)::int AS recipients,
       (SELECT COUNT(*) FROM announcement_dismissals
        WHERE announcement_dismissals.announcement_id = announcements.id)::int AS dismissed`,
      "FROM announcements JOIN users AS admins ON announcements.admin_id = admins.id",
      "announcements.created_at DESC, announcements.id DESC",
      [],
      page,
    );
    return res.status(200).json({ announcements: rows, total });
  } catch (error) {
    console.error("Error while fetching announcements:", error);
    return res.status(500).json({ error: "An error occurred while fetching announcements." });
  }
};

export const endAnnouncement = async (req: Request, res: Response) => {
  const announcementId = parseId(req.params.id);
  if (announcementId === null) {
    return res.status(404).json({ error: "Announcement not found." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT announcements.ended_at IS NULL
         AND (announcements.expires_at IS NULL OR announcements.expires_at > NOW()) AS is_active
       FROM announcements WHERE announcements.id = $1 FOR UPDATE`,
      [announcementId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Announcement not found." });
    }
    if (!existing.rows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Announcement has already ended." });
    }
    await client.query("UPDATE announcements SET ended_at = NOW() WHERE announcements.id = $1", [announcementId]);
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "END_ANNOUNCEMENT",
      targetAnnouncementId: announcementId,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Announcement ended." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while ending announcement:", error);
    return res.status(500).json({ error: "An error occurred while ending the announcement." });
  } finally {
    if (client) client.release();
  }
};
