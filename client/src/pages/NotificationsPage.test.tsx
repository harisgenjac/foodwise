import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "./NotificationsPage.js";
import { NotificationsProvider } from "../context/NotificationsContext.js";
import { apiMock, makeNotification, makeUser, renderWithProviders, t } from "../test/utils.js";

const renderPage = () => {
  apiMock.delete.mockResolvedValue({ data: {} });
  return renderWithProviders(
    <NotificationsProvider>
      <NotificationsPage />
    </NotificationsProvider>,
    {
      route: "/notifications",
      path: "/notifications",
      user: makeUser({ role: "STORE" }),
      get: {
        "/notifications": {
          notifications: [makeNotification({ id: 1, is_read: false }), makeNotification({ id: 2, is_read: true })],
          unreadCount: 1,
        },
      },
    },
  );
};

const openDeleteRead = async () => {
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: t("notifications.deleteRead") }));
  return screen.getByRole("dialog", { name: t("notifications.deleteReadConfirmation") });
};

describe("NotificationsPage: delete read", () => {
  it("asks first and deletes nothing after cancelling", async () => {
    const dialog = await openDeleteRead();
    expect(dialog).toHaveTextContent(t("notifications.deleteReadConfirmationText"));
    expect(within(dialog).getByRole("button", { name: t("common.cancel") })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("deletes the read notifications once confirmed", async () => {
    const dialog = await openDeleteRead();
    await userEvent.click(within(dialog).getByRole("button", { name: t("notifications.deleteRead") }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith("/notifications/read"));
  });
});
