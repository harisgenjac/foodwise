import pool from "../config/db.js";
import type { Request, Response } from "express";

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    const unreadCount = result.rows.filter(n => !n.is_read).length;
    return res.status(200).json({ notifications: result.rows, unreadCount });
  } catch (error) {
    console.error("Greška prilikom dohvatanja notifikacija:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja notifikacija." });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user!.id;
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    return res.status(200).json({ message: "Notifikacija označena kao pročitana." });
  } catch (error) {
    console.error("Greška prilikom ažuriranja notifikacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom ažuriranja notifikacija." });
  }
};
