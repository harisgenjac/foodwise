import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/axios.js";

export type NotificationType =
  | "RESERVATION_CREATED"
  | "RESERVATION_ACCEPTED"
  | "RESERVATION_REJECTED"
  | "RESERVATION_CANCELLED"
  | "RESERVATION_EXPIRED"
  | "PRODUCT_EXPIRED"
  | "PRODUCT_SOLD_OUT"
  | "PRODUCT_EXPIRING_SOON"
  | "PICKUP_TODAY"
  | "RESERVATION_COMPLETED"
  | "PICKUP_MISSED"
  | "PRODUCT_REMOVED_BY_ADMIN"
  | "DONATION_REMOVED_BY_ADMIN"
  | "RESERVATION_CANCELLED_BY_ADMIN"
  | "PLATFORM_ANNOUNCEMENT";

export interface Notification {
  id: number;
  user_id: number;
  // null for notifications created before types existed; those show `message` as is.
  type: NotificationType | null;
  // English fallback; the UI translates by `type`.
  message: string;
  is_read: boolean;
  created_at: string;
  reservation_id: number | null;
  product_id: number | null;
  donation_id?: number | null;
  // Free text from the server, shown after the translated text (an admin's reason).
  details?: string | null;
  // Platform announcements: the title in both languages (English may be missing).
  announcement_id?: number | null;
  announcement_title_bs?: string | null;
  announcement_title_en?: string | null;
  // The product's name, or the donation's for donation notifications.
  product_name: string | null;
  unit: string | null;
  quantity: string | null;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notification: Notification) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notification: Notification) => Promise<void>;
  deleteRead: () => Promise<void>;
}

const POLL_INTERVAL_MS = 50000;

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// One shared notification state for the header bell and the notifications page.
// `enabled` false skips loading (a user who must first replace a temporary password).
export const NotificationsProvider = ({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get("/notifications");
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    window.addEventListener("focus", fetchNotifications);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", fetchNotifications);
    };
  }, [fetchNotifications, enabled]);

  // The updates below are applied optimistically; on failure the list is reloaded from the server.
  const markAsRead = async (notification: Notification) => {
    if (notification.is_read) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await api.patch(`/notifications/${notification.id}/read`);
    } catch (err) {
      console.error(err);
      fetchNotifications();
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.patch("/notifications/read-all");
    } catch (err) {
      console.error(err);
      fetchNotifications();
    }
  };

  const deleteNotification = async (notification: Notification) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    if (!notification.is_read) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await api.delete(`/notifications/${notification.id}`);
    } catch (err) {
      console.error(err);
      fetchNotifications();
    }
  };

  const deleteRead = async () => {
    setNotifications((prev) => prev.filter((n) => !n.is_read));
    try {
      await api.delete("/notifications/read");
      // The list is capped, so older unread ones may now fit in it.
      fetchNotifications();
    } catch (err) {
      console.error(err);
      fetchNotifications();
    }
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications mora biti korišten unutar NotificationsProvider-a.");
  }
  return context;
};
