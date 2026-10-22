import type { TFunction } from "i18next";
import {
  Ban,
  Bell,
  CalendarX,
  CircleCheck,
  CircleX,
  Coins,
  Megaphone,
  Clock,
  Hourglass,
  PackageCheck,
  ShieldAlert,
  ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notification, NotificationType } from "../context/NotificationsContext.js";
import type { User } from "../types/index.js";

export const NOTIFICATION_META: Record<NotificationType, { icon: LucideIcon; style: string }> = {
  RESERVATION_CREATED: { icon: ShoppingBag, style: "bg-amber-50 text-amber-600" },
  RESERVATION_ACCEPTED: { icon: CircleCheck, style: "bg-green-50 text-green-600" },
  RESERVATION_REJECTED: { icon: CircleX, style: "bg-red-50 text-red-600" },
  RESERVATION_CANCELLED: { icon: Ban, style: "bg-gray-100 text-gray-600" },
  RESERVATION_EXPIRED: { icon: CalendarX, style: "bg-red-50 text-red-600" },
  PRODUCT_EXPIRED: { icon: CalendarX, style: "bg-red-50 text-red-600" },
  PRODUCT_SOLD_OUT: { icon: PackageCheck, style: "bg-green-50 text-green-600" },
  PRODUCT_EXPIRING_SOON: { icon: Hourglass, style: "bg-amber-50 text-amber-600" },
  PICKUP_TODAY: { icon: Clock, style: "bg-blue-50 text-blue-600" },
  RESERVATION_COMPLETED: { icon: PackageCheck, style: "bg-green-50 text-green-600" },
  PICKUP_MISSED: { icon: CalendarX, style: "bg-red-50 text-red-600" },
  PRODUCT_REMOVED_BY_ADMIN: { icon: ShieldAlert, style: "bg-red-50 text-red-600" },
  DONATION_REMOVED_BY_ADMIN: { icon: ShieldAlert, style: "bg-red-50 text-red-600" },
  RESERVATION_CANCELLED_BY_ADMIN: { icon: ShieldAlert, style: "bg-gray-100 text-gray-600" },
  PLATFORM_ANNOUNCEMENT: { icon: Megaphone, style: "bg-blue-50 text-blue-600" },
  CREDIT_REQUEST_CREATED: { icon: Coins, style: "bg-amber-50 text-amber-600" },
  CREDIT_REQUEST_APPROVED: { icon: Coins, style: "bg-green-50 text-green-600" },
  CREDIT_REQUEST_REJECTED: { icon: Coins, style: "bg-red-50 text-red-600" },
};

// notifications.credits.<key> per credit notification type and request type.
const CREDIT_TEXT_KEYS: Partial<Record<NotificationType, { SUBSCRIPTION: string; TOPUP: string }>> = {
  CREDIT_REQUEST_CREATED: { SUBSCRIPTION: "subscriptionCreated", TOPUP: "topupCreated" },
  CREDIT_REQUEST_APPROVED: { SUBSCRIPTION: "subscriptionApproved", TOPUP: "topupApproved" },
  CREDIT_REQUEST_REJECTED: { SUBSCRIPTION: "subscriptionRejected", TOPUP: "topupRejected" },
};

const DEFAULT_META = { icon: Bell, style: "bg-orange-50 text-orange-600" };

export const getNotificationMeta = (notification: Notification) =>
  (notification.type && NOTIFICATION_META[notification.type]) || DEFAULT_META;

// Reservation details first, then product details, then the donations page; untyped (older)
// notifications go to the role's list.
export const getNotificationLink = (notification: Notification, role: User["role"] | undefined) => {
  if (notification.reservation_id) return `/reservation/${notification.reservation_id}`;
  if (notification.product_id) return `/products/${notification.product_id}`;
  if (notification.donation_id) return "/donate-food";
  // The full announcement text is in the banner on every page.
  if (notification.announcement_id) return "/dashboard";
  // Admins decide requests on the requests page; users see the result on the Credits page.
  if (notification.type === "CREDIT_REQUEST_CREATED") return "/admin/credit-requests";
  if (notification.type === "CREDIT_REQUEST_APPROVED" || notification.type === "CREDIT_REQUEST_REJECTED") {
    return "/credits";
  }
  return role === "STORE" ? "/reservations" : "/my-reservations";
};

export const getNotificationText = (notification: Notification, t: TFunction, language = "bs") => {
  if (notification.type === "PLATFORM_ANNOUNCEMENT" && notification.announcement_title_bs) {
    const title =
      (language === "en" && notification.announcement_title_en) || notification.announcement_title_bs;
    return t("notifications.types.PLATFORM_ANNOUNCEMENT", { title });
  }
  const creditKeys = notification.type ? CREDIT_TEXT_KEYS[notification.type] : undefined;
  if (creditKeys) {
    // Without the joined request (deleted) the generic text of the type is used.
    return notification.credit_request_type
      ? t(`notifications.credits.${creditKeys[notification.credit_request_type]}`, {
          credits: notification.credit_amount ?? "",
          requester: notification.credit_requester ?? "",
        })
      : t(`notifications.types.${notification.type}`);
  }
  const text =
    !notification.type || !notification.product_name
      ? notification.message
      : t(`notifications.types.${notification.type}`, {
          product: notification.product_name,
          quantity: notification.quantity ? parseFloat(notification.quantity) : "",
          unit: notification.unit ?? "",
          defaultValue: notification.message,
        });
  return notification.details
    ? `${text} ${t("notifications.reason", { reason: notification.details })}`
    : text;
};

// "5 min ago", "yesterday"...; older than a week falls back to the date. Uses i18n keys
// instead of Intl.RelativeTimeFormat, which browsers do not translate to Bosnian.
export const formatRelativeTime = (date: string, t: TFunction, language: string) => {
  const created = new Date(date);
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
  if (minutes < 1) return t("notifications.time.justNow");
  if (minutes < 60) return t("notifications.time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("notifications.time.daysAgo", { count: days });
  return created.toLocaleDateString(language, { day: "numeric", month: "numeric", year: "numeric" });
};

export type NotificationGroup = "today" | "yesterday" | "earlier";

export const getNotificationGroup = (date: string): NotificationGroup => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const created = new Date(date).getTime();
  if (created >= startOfToday.getTime()) return "today";
  if (created >= startOfToday.getTime() - 86400 * 1000) return "yesterday";
  return "earlier";
};
