import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationItem from "./NotificationItem.js";
import { NotificationsProvider } from "../../context/NotificationsContext.js";
import i18n from "../../i18n/config.js";
import {
  apiMock,
  makeNotification,
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
    const notification = makeNotification();
    renderItem(notification);
    expect(screen.getByText(t(`notifications.types.RESERVATION_CREATED`, {
      product: "Piletina",
      quantity: 2,
      unit: "kg",
    }))).toBeInTheDocument();
    expect(screen.getByText(t("notifications.time.justNow"))).toBeInTheDocument();
  });

  it("marks an unread notification as read and opens its link", async () => {
    const onNavigate = vi.fn();
    renderItem(makeNotification({ id: 4, reservation_id: 20 }), onNavigate);

    await userEvent.click(screen.getByText(/Piletina/));
    expect(apiMock.patch).toHaveBeenCalledWith("/notifications/4/read");
    expect(onNavigate).toHaveBeenCalled();
    expect(await screen.findByTestId("location")).toHaveTextContent("/reservation/20");
  });

  it("does not mark a read notification again", async () => {
    renderItem(makeNotification({ is_read: true, reservation_id: null, product_id: 10 }));
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
