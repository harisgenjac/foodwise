import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";
import { useNotifications } from "../../context/NotificationsContext.js";
import type { Notification } from "../../context/NotificationsContext.js";
import {
  formatRelativeTime,
  getNotificationLink,
  getNotificationMeta,
  getNotificationText,
} from "../../utils/notifications.js";

interface NotificationItemProps {
  notification: Notification;
  // Smaller rows for the header dropdown.
  compact?: boolean;
  // Called after a click, before navigating (e.g. to close the dropdown).
  onNavigate?: () => void;
}

function NotificationItem({ notification, compact = false, onNavigate }: NotificationItemProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { markAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const { icon: Icon, style } = getNotificationMeta(notification);
  const unread = !notification.is_read;

  const handleClick = () => {
    markAsRead(notification);
    onNavigate?.();
    navigate(getNotificationLink(notification, user?.role));
  };

  return (
    <div
      className={`group relative flex items-start transition-colors hover:bg-gray-50 ${
        unread ? "bg-orange-50/50" : ""
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left ${
          compact ? "px-4 py-3 pr-10" : "px-5 py-4"
        }`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full ${style} ${
            compact ? "h-9 w-9" : "h-11 w-11"
          }`}
        >
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} />
        </span>
        <span className={`min-w-0 flex-1 ${compact ? "" : "pr-10"}`}>
          <span
            className={`block line-clamp-2 ${compact ? "text-sm" : "text-[15px]"} ${
              unread ? "font-semibold text-gray-900" : "text-gray-600"
            }`}
          >
            {getNotificationText(notification, t, i18n.language)}
          </span>
          <span className={`mt-1 block text-xs ${unread ? "text-orange-600" : "text-gray-400"}`}>
            {formatRelativeTime(notification.created_at, t, i18n.language)}
          </span>
        </span>
        {!compact && (
          <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
        )}
      </button>

      {unread && (
        <span
          aria-hidden
          className={`absolute h-2 w-2 rounded-full bg-orange-500 transition-opacity group-hover:opacity-0 ${
            compact ? "right-4 top-4" : "right-[3.25rem] top-5"
          }`}
        />
      )}

      <button
        type="button"
        onClick={() => deleteNotification(notification)}
        aria-label={t("notifications.delete")}
        title={t("notifications.delete")}
        className={`absolute cursor-pointer rounded-full p-1.5 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 ${
          compact ? "right-2 top-2.5" : "right-10 top-3.5"
        }`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default NotificationItem;
