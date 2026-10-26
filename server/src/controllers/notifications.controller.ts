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
        reservations.quantity,
        notifications.credit_request_id,
        credit_requests.request_type AS credit_request_type,
        credit_requests.credits AS credit_amount,
        COALESCE(requesters.business_name, requesters.email) AS credit_requester
      FROM notifications
      LEFT JOIN products ON notifications.product_id = products.id
      LEFT JOIN donation_offers ON notifications.donation_id = donation_offers.id
      LEFT JOIN announcements ON notifications.announcement_id = announcements.id
      LEFT JOIN reservations ON notifications.reservation_id = reservations.id
      LEFT JOIN credit_requests ON notifications.credit_request_id = credit_requests.id
      LEFT JOIN users AS requesters ON credit_requests.user_id = requesters.id
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
    console.error("Error while fetching notifications:", error);
    return res.status(500).json({ error: "An error occurred while fetching notifications." });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const notificationId = parseId(req.params.id);
    if (notificationId === null) {
      return res.status(404).json({ error: "Notification not found." });
    }
    const userId = req.user!.id;
    const result = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    return res.status(200).json({ message: "Notification marked as read." });
  } catch (error) {
    console.error("Error while updating notifications:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while updating notifications." });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return res.status(200).json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("Error while updating notifications:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while updating notifications." });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const notificationId = parseId(req.params.id);
    if (notificationId === null) {
      return res.status(404).json({ error: "Notification not found." });
    }
    const userId = req.user!.id;
    const result = await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    return res.status(200).json({ message: "Notification deleted." });
  } catch (error) {
    console.error("Error while deleting notification:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting the notification." });
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
      .json({ message: "Read notifications deleted.", deleted: result.rowCount ?? 0 });
  } catch (error) {
    console.error("Error while deleting notifications:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting notifications." });
  }
};
