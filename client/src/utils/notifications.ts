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
  KeyRound,
  PackageCheck,
  ShieldAlert,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notification, NotificationType } from "../context/NotificationsContext.js";
import type { User } from "../types/index.js";
import { SUBSCRIPTION_SECTION, TOPUP_SECTION } from "./credits.js";

export const NOTIFICATION_META: Record<NotificationType, { icon: LucideIcon; style: string }> = {
  ORDER_CREATED: { icon: ShoppingBag, style: "bg-warning-50 text-warning-700" },
  ORDER_CANCELLED: { icon: Ban, style: "bg-neutral-100 text-neutral-600" },
  ORDER_ACCEPTED: { icon: CircleCheck, style: "bg-success-100 text-success-800" },
  ORDER_PARTIALLY_ACCEPTED: { icon: CircleCheck, style: "bg-warning-50 text-warning-700" },
  ORDER_REJECTED: { icon: CircleX, style: "bg-danger-50 text-danger-700" },
  ORDER_AUTO_REJECTED: { icon: CircleX, style: "bg-danger-50 text-danger-700" },
  ORDER_COMPLETED: { icon: PackageCheck, style: "bg-success-100 text-success-800" },
  ORDER_PICKUP_MISSED: { icon: CalendarX, style: "bg-danger-50 text-danger-700" },
  ORDER_PICKUP_TODAY: { icon: Clock, style: "bg-info-50 text-info-700" },
  ORDER_ITEMS_EXPIRED: { icon: CalendarX, style: "bg-warning-50 text-warning-700" },
  ORDER_EXPIRED: { icon: CalendarX, style: "bg-danger-50 text-danger-700" },
  ORDER_ITEMS_REMOVED: { icon: ShieldAlert, style: "bg-warning-50 text-warning-700" },
  ORDER_CANCELLED_BY_ADMIN: { icon: ShieldAlert, style: "bg-neutral-100 text-neutral-600" },
  ORDER_CANCELLED_STORE_CLOSED: { icon: Ban, style: "bg-neutral-100 text-neutral-600" },
  DELIVERY_FAILED: { icon: Truck, style: "bg-danger-50 text-danger-700" },
  DELIVERY_FAILED_AFTER_PICKUP: { icon: Truck, style: "bg-danger-50 text-danger-700" },
  DELIVERY_DELIVERED: { icon: Truck, style: "bg-success-100 text-success-800" },
  ORDER_SWITCHED_TO_PICKUP: { icon: Store, style: "bg-info-50 text-info-700" },
  ORDER_CANCELLED_DELIVERY_FAILED: { icon: Ban, style: "bg-neutral-100 text-neutral-600" },
  PRODUCT_EXPIRED: { icon: CalendarX, style: "bg-danger-50 text-danger-700" },
  PRODUCT_SOLD_OUT: { icon: PackageCheck, style: "bg-success-100 text-success-800" },
  PRODUCT_EXPIRING_SOON: { icon: Hourglass, style: "bg-warning-50 text-warning-700" },
  PRODUCT_REMOVED_BY_ADMIN: { icon: ShieldAlert, style: "bg-danger-50 text-danger-700" },
  DONATION_REMOVED_BY_ADMIN: { icon: ShieldAlert, style: "bg-danger-50 text-danger-700" },
  BRANCH_BLOCKED: { icon: ShieldAlert, style: "bg-danger-50 text-danger-700" },
  BRANCH_UNBLOCKED: { icon: Store, style: "bg-success-100 text-success-800" },
  BRANCH_DEACTIVATED: { icon: Store, style: "bg-neutral-100 text-neutral-600" },
  BRANCH_REACTIVATED: { icon: Store, style: "bg-success-100 text-success-800" },
  PLATFORM_ANNOUNCEMENT: { icon: Megaphone, style: "bg-info-50 text-info-700" },
  CREDIT_REQUEST_CREATED: { icon: Coins, style: "bg-warning-50 text-warning-700" },
  CREDIT_REQUEST_APPROVED: { icon: Coins, style: "bg-success-100 text-success-800" },
  CREDIT_REQUEST_REJECTED: { icon: Coins, style: "bg-danger-50 text-danger-700" },
  CREDIT_RENEWAL_CREATED: { icon: Coins, style: "bg-info-50 text-info-700" },
  CREDIT_REQUEST_EXPIRED: { icon: Coins, style: "bg-neutral-100 text-neutral-600" },
  CREDIT_RENEWAL_SKIPPED: { icon: Coins, style: "bg-warning-50 text-warning-700" },
  BRANCH_TOPUP_REQUESTED: { icon: Coins, style: "bg-warning-50 text-warning-700" },
  BRANCH_CREDIT_REQUEST_APPROVED: { icon: Coins, style: "bg-success-100 text-success-800" },
  BRANCH_CREDIT_REQUEST_REJECTED: { icon: Coins, style: "bg-danger-50 text-danger-700" },
  BRANCH_CREDIT_REQUEST_EXPIRED: { icon: Coins, style: "bg-neutral-100 text-neutral-600" },
  CREDIT_TOPUP_COMPANY_APPROVED: { icon: Coins, style: "bg-info-50 text-info-700" },
  CREDIT_TOPUP_COMPANY_REJECTED: { icon: Coins, style: "bg-danger-50 text-danger-700" },
  PASSWORD_CHANGED: { icon: KeyRound, style: "bg-info-50 text-info-700" },
};

// notifications.credits.<key> per credit notification type and request type.
const CREDIT_TEXT_KEYS: Partial<Record<NotificationType, { SUBSCRIPTION: string; TOPUP: string }>> = {
  CREDIT_REQUEST_CREATED: { SUBSCRIPTION: "subscriptionCreated", TOPUP: "topupCreated" },
  CREDIT_REQUEST_APPROVED: { SUBSCRIPTION: "subscriptionApproved", TOPUP: "topupApproved" },
  CREDIT_REQUEST_REJECTED: { SUBSCRIPTION: "subscriptionRejected", TOPUP: "topupRejected" },
  // Renewals are always subscriptions.
  CREDIT_RENEWAL_CREATED: { SUBSCRIPTION: "renewalCreated", TOPUP: "renewalCreated" },
  CREDIT_REQUEST_EXPIRED: { SUBSCRIPTION: "subscriptionExpired", TOPUP: "topupExpired" },
  // A branch's own top-up, decided by its headquarters (always a top-up).
  CREDIT_TOPUP_COMPANY_APPROVED: { SUBSCRIPTION: "companyTopupApproved", TOPUP: "companyTopupApproved" },
  CREDIT_TOPUP_COMPANY_REJECTED: { SUBSCRIPTION: "companyTopupRejected", TOPUP: "companyTopupRejected" },
  // To a headquarters, about one of its branches.
  BRANCH_TOPUP_REQUESTED: { SUBSCRIPTION: "branchTopupRequested", TOPUP: "branchTopupRequested" },
  BRANCH_CREDIT_REQUEST_APPROVED: { SUBSCRIPTION: "branchSubscriptionApproved", TOPUP: "branchTopupApproved" },
  BRANCH_CREDIT_REQUEST_REJECTED: { SUBSCRIPTION: "branchSubscriptionRejected", TOPUP: "branchTopupRejected" },
  BRANCH_CREDIT_REQUEST_EXPIRED: { SUBSCRIPTION: "branchSubscriptionExpired", TOPUP: "branchTopupExpired" },
};

const DEFAULT_META = { icon: Bell, style: "bg-brand-50 text-brand-800" };

export const getNotificationMeta = (notification: Notification) =>
  (notification.type && NOTIFICATION_META[notification.type]) || DEFAULT_META;

// Order details first, then product details, then the donations page; untyped (older)
// notifications go to the role's order list.
export const getNotificationLink = (notification: Notification, role: User["role"] | undefined) => {
  // A branch asking for credits waits on the headquarters' credits page; other notifications
  // about one of its branches open the branch page.
  if (notification.type === "BRANCH_TOPUP_REQUESTED") return "/company/credits";
  if (notification.type === "PASSWORD_CHANGED") return "/my-profile";
  if (role === "COMPANY" && notification.branch_id) return `/company/branches/${notification.branch_id}`;
  if (notification.order_id) return `/orders/${notification.order_id}`;
  if (notification.product_id) return `/products/${notification.product_id}`;
  if (notification.donation_id) return "/donate-food";
  // The full announcement text is in the banner on every page.
  if (notification.announcement_id) return "/dashboard";
  // Admins decide requests on the requests page; users see the result on the Credits page.
  if (notification.type === "CREDIT_REQUEST_CREATED") return "/admin/credit-requests";
  if (notification.type === "CREDIT_REQUEST_APPROVED" || notification.type === "CREDIT_REQUEST_REJECTED") {
    return "/credits";
  }
  // Renewals and expired requests: My profile, where the user sees the request or picks a plan.
  if (notification.type === "CREDIT_TOPUP_COMPANY_APPROVED" || notification.type === "CREDIT_TOPUP_COMPANY_REJECTED") {
    return `/my-profile#${TOPUP_SECTION}`;
  }
  if (notification.type === "CREDIT_REQUEST_EXPIRED" && notification.credit_request_type === "TOPUP") {
    return `/my-profile#${TOPUP_SECTION}`;
  }
  if (
    notification.type === "CREDIT_RENEWAL_CREATED" ||
    notification.type === "CREDIT_REQUEST_EXPIRED" ||
    notification.type === "CREDIT_RENEWAL_SKIPPED"
  ) {
    return `/my-profile#${SUBSCRIPTION_SECTION}`;
  }
  if (role === "COMPANY") return "/dashboard";
  return role === "STORE" ? "/orders" : "/my-orders";
};

export const getNotificationText = (notification: Notification, t: TFunction, language = "bs") => {
  if (notification.type === "PLATFORM_ANNOUNCEMENT" && notification.announcement_title_bs) {
    const title =
      (language === "en" && notification.announcement_title_en) || notification.announcement_title_bs;
    return t("notifications.types.PLATFORM_ANNOUNCEMENT", { title });
  }
  // No request was created, so there is nothing to join: the type says it all.
  if (notification.type === "CREDIT_RENEWAL_SKIPPED") return t("notifications.types.CREDIT_RENEWAL_SKIPPED");
  if (notification.type === "PASSWORD_CHANGED") return t("notifications.types.PASSWORD_CHANGED");
  // An order's text names it by its code and the other party; without the joined order (deleted)
  // the English message is shown. A delivery's details are the provider's code, not for people.
  const isDelivery = notification.type?.startsWith("DELIVERY_") ?? false;
  if (notification.type?.startsWith("ORDER_") || isDelivery) {
    const text = notification.order_code
      ? t(`notifications.types.${notification.type}`, {
          code: `#${notification.order_code}`,
          store: notification.order_store_name ?? "",
          restaurant: notification.order_restaurant_name ?? "",
          defaultValue: notification.message,
        })
      : notification.message;
    return notification.details && !isDelivery
      ? `${text} ${t("notifications.reason", { reason: notification.details })}`
      : text;
  }
  const creditKeys = notification.type ? CREDIT_TEXT_KEYS[notification.type] : undefined;
  if (creditKeys) {
    // A branch's request names its company: "Bingo d.o.o. → Bingo Tuzla".
    const requester = notification.credit_company
      ? `${notification.credit_company} → ${notification.credit_requester ?? ""}`
      : (notification.credit_requester ?? "");
    // Without the joined request (deleted) the generic text of the type is used.
    const text = notification.credit_request_type
      ? t(`notifications.credits.${creditKeys[notification.credit_request_type]}`, {
          credits: notification.credit_amount ?? "",
          requester,
          branch: notification.branch_name ?? notification.credit_requester ?? "",
        })
      : t(`notifications.types.${notification.type}`, { branch: notification.branch_name ?? "" });
    return notification.details ? `${text} ${t("notifications.reason", { reason: notification.details })}` : text;
  }
  const text = notification.type?.startsWith("BRANCH_")
    ? t(`notifications.types.${notification.type}`, { branch: notification.branch_name ?? "" })
    : !notification.type || !notification.product_name
      ? notification.message
      : t(`notifications.types.${notification.type}`, {
          product: notification.product_name,
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
