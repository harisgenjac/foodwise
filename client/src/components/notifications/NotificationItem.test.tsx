import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationItem from "./NotificationItem.js";
import { NotificationsProvider } from "../../context/NotificationsContext.js";
import i18n from "../../i18n/config.js";
import {
  apiMock,
  makeNotification,
  makeOrderNotification,
  makeUser,
  renderWithProviders,
  t,
} from "../../test/utils.js";
import type { Notification } from "../../context/NotificationsContext.js";

const renderItem = (notification: Notification, onNavigate?: () => void) => {
  apiMock.patch.mockResolvedValue({ data: {} });
  apiMock.delete.mockResolvedValue({ data: {} });
  return renderWithProviders(
    <NotificationsProvider>
      <NotificationItem notification={notification} onNavigate={onNavigate} />
    </NotificationsProvider>,
    {
      route: "/notifications",
      path: "/notifications",
      user: makeUser({ role: "STORE" }),
      get: { "/notifications": { notifications: [notification], unreadCount: notification.is_read ? 0 : 1 } },
    },
  );
};

describe("NotificationItem", () => {
  it("shows the translated text and the relative time", async () => {
    await i18n.changeLanguage("en");
    const notification = makeOrderNotification();
    renderItem(notification);
    expect(screen.getByText(t("notifications.types.ORDER_CREATED", {
      code: "#K7PM",
      restaurant: "Restoran Ukus",
    }))).toBeInTheDocument();
    expect(screen.getByText(t("notifications.time.justNow"))).toBeInTheDocument();
  });

  it("marks an unread notification as read and opens its link", async () => {
    const onNavigate = vi.fn();
    renderItem(makeOrderNotification({ id: 4 }), onNavigate);

    await userEvent.click(screen.getByText(/K7PM/));
    expect(apiMock.patch).toHaveBeenCalledWith("/notifications/4/read");
    expect(onNavigate).toHaveBeenCalled();
    // Until the order details page exists, an order opens the store's list.
    expect(await screen.findByTestId("location")).toHaveTextContent("/reservations");
  });

  it("falls back to the English message when the order is gone", async () => {
    renderItem(makeOrderNotification({ order_code: null }));
    expect(screen.getByText("New order #K7PM: 1 item.")).toBeInTheDocument();
  });

  it("does not mark a read notification again", async () => {
    renderItem(makeNotification({ is_read: true }));
    await userEvent.click(screen.getByText(/Piletina/));
    expect(apiMock.patch).not.toHaveBeenCalled();
    expect(await screen.findByTestId("location")).toHaveTextContent("/products/10");
  });

  it("deletes the notification", async () => {
    renderItem(makeNotification({ id: 9 }));
    await userEvent.click(screen.getByRole("button", { name: t("notifications.delete") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/notifications/9");
  });
});
