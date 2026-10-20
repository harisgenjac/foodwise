import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import EmptyState from "../components/product/EmptyState.js";
import NotificationItem from "../components/notifications/NotificationItem.js";
import { useNotifications } from "../context/NotificationsContext.js";
import type { Notification } from "../context/NotificationsContext.js";
import { getNotificationGroup } from "../utils/notifications.js";
import type { NotificationGroup } from "../utils/notifications.js";

type Filter = "all" | "unread";

const GROUP_ORDER: NotificationGroup[] = ["today", "yesterday", "earlier"];

function NotificationsPage() {
  const { notifications, unreadCount, loading, markAllAsRead, deleteRead } = useNotifications();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");

  if (loading) {
    return <LoadingSpinner />;
  }

  const visible = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((n) => getNotificationGroup(n.created_at) === group),
  })).filter(({ items }) => items.length > 0);
  const hasRead = notifications.some((n) => n.is_read);

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: t("notifications.all") },
    { key: "unread", label: t("notifications.unread"), count: unreadCount },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ProductPageHeader
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        icon={Bell}
        {...(unreadCount > 0 && { count: t("notifications.unreadCount", { count: unreadCount }) })}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t("notifications.noNotificationsTitle")}
          subtitle={t("notifications.noNotificationsSubtitle")}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-fit rounded-full border border-gray-100 bg-white p-1 shadow-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                  {!!tab.count && (
                    <span
                      className={`rounded-full px-1.5 text-xs font-semibold ${
                        filter === tab.key ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50"
                >
                  <CheckCheck className="h-4 w-4" />
                  {t("notifications.markAllRead")}
                </button>
              )}
              {hasRead && (
                <button
                  type="button"
                  onClick={deleteRead}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("notifications.deleteRead")}
                </button>
              )}
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={CheckCheck}
              title={t("notifications.allReadTitle")}
              subtitle={t("notifications.allReadSubtitle")}
            />
          ) : (
            groups.map(({ group, items }) => (
              <NotificationSection key={group} title={t(`notifications.groups.${group}`)} items={items} />
            ))
          )}
        </>
      )}
    </div>
  );
}

function NotificationSection({ title, items }: { title: string; items: Notification[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {items.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </div>
    </section>
  );
}

export default NotificationsPage;
