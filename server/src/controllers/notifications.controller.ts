import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";

const NOTIFICATIONS_LIMIT = 50;

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT
        notifications.id,
        notifications.user_id,
        notifications.type,
        notifications.message,
        notifications.is_read,
        notifications.created_at,
        notifications.reservation_id,
        notifications.product_id,
        notifications.donation_id,
        notifications.details,
        notifications.announcement_id,
        announcements.title_bs AS announcement_title_bs,
        announcements.title_en AS announcement_title_en,
        COALESCE(products.name, donation_offers.name) AS product_name,
        COALESCE(products.unit, donation_offers.unit) AS unit,
        reservations.quantity
      FROM notifications
      LEFT JOIN products ON notifications.product_id = products.id
      LEFT JOIN donation_offers ON notifications.donation_id = donation_offers.id
      LEFT JOIN announcements ON notifications.announcement_id = announcements.id
      LEFT JOIN reservations ON notifications.reservation_id = reservations.id
      WHERE notifications.user_id = $1
      ORDER BY notifications.created_at DESC, notifications.id DESC
      LIMIT $2`,
      [userId, NOTIFICATIONS_LIMIT],
    );
    const unread = await pool.query(
      `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    const unreadCount = parseInt(unread.rows[0].unread_count, 10);
    return res.status(200).json({ notifications: result.rows, unreadCount });
  } catch (error) {
    console.error("Greška prilikom dohvatanja notifikacija:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja notifikacija." });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const notificationId = parseId(req.params.id);
    if (notificationId === null) {
      return res.status(404).json({ error: "Notifikacija nije pronađena." });
    }
    const userId = req.user!.id;
    const result = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notifikacija nije pronađena." });
    }
    return res.status(200).json({ message: "Notifikacija označena kao pročitana." });
  } catch (error) {
    console.error("Greška prilikom ažuriranja notifikacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom ažuriranja notifikacija." });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return res.status(200).json({ message: "Sve notifikacije su označene kao pročitane." });
  } catch (error) {
    console.error("Greška prilikom ažuriranja notifikacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom ažuriranja notifikacija." });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const notificationId = parseId(req.params.id);
    if (notificationId === null) {
      return res.status(404).json({ error: "Notifikacija nije pronađena." });
    }
    const userId = req.user!.id;
    const result = await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notifikacija nije pronađena." });
    }
    return res.status(200).json({ message: "Notifikacija je obrisana." });
  } catch (error) {
    console.error("Greška prilikom brisanja notifikacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom brisanja notifikacije." });
  }
};

export const deleteReadNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `DELETE FROM notifications WHERE user_id = $1 AND is_read = true`,
      [userId],
    );
    return res
      .status(200)
      .json({ message: "Pročitane notifikacije su obrisane.", deleted: result.rowCount ?? 0 });
  } catch (error) {
    console.error("Greška prilikom brisanja notifikacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom brisanja notifikacija." });
  }
};
