import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import OrderSettingsSection from "./OrderSettingsSection.js";
import MyProfilePage from "../../pages/MyProfilePage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { OrderSettings } from "../../types/index.js";

const SETTINGS: OrderSettings = {
  delivery_enabled: true,
  preparation_minutes: 30,
  orders_paused: false,
  orders_paused_until: null,
};

const saved = (settings: Partial<OrderSettings>, message = "Order settings saved.") => ({
  data: { message, settings: { ...SETTINGS, ...settings } },
});

const deliverySwitch = () => screen.getByRole("switch", { name: t("orderSettings.delivery") });

describe("OrderSettingsSection", () => {
  it("turns delivery off and changes the preparation time, saving each at once", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValueOnce(saved({ delivery_enabled: false }));
    renderWithProviders(<OrderSettingsSection initial={SETTINGS} />);

    expect(deliverySwitch()).toHaveAttribute("aria-checked", "true");
    await userEvent.click(deliverySwitch());
    expect(apiMock.patch).toHaveBeenCalledWith("/users/me/order-settings", { delivery_enabled: false });
    await waitFor(() => expect(deliverySwitch()).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText(t("orderSettings.deliveryOffHint"))).toBeInTheDocument();
    expect(success).toHaveBeenCalledWith("Order settings saved.");

    apiMock.patch.mockResolvedValueOnce(saved({ delivery_enabled: false, preparation_minutes: 60 }));
    const select = screen.getByLabelText(new RegExp(t("orderSettings.preparation")));
    expect(select).toHaveValue("30");
    await userEvent.selectOptions(select, "60");
    expect(apiMock.patch).toHaveBeenLastCalledWith("/users/me/order-settings", { preparation_minutes: 60 });
    await waitFor(() => expect(select).toHaveValue("60"));
  });

  it("goes back and shows the error when saving fails", async () => {
    apiMock.patch.mockRejectedValue(axiosError(400, "Vrijeme pripreme nije ispravno."));
    const errorToast = vi.spyOn(toast, "error");
    renderWithProviders(<OrderSettingsSection initial={SETTINGS} />);

    await userEvent.click(deliverySwitch());
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Vrijeme pripreme nije ispravno."));
    expect(deliverySwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("pauses orders for a chosen length and resumes them", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 16, 10, 0) });
    try {
      const until = new Date(2026, 10, 16, 12, 0).toISOString();
      apiMock.patch.mockResolvedValueOnce(saved({ orders_paused: true, orders_paused_until: until }, "Orders paused."));
      renderWithProviders(<OrderSettingsSection initial={SETTINGS} />);

      const control = screen.getByTestId("order-pause");
      expect(within(control).getByText(t("orderPause.receivingTitle"))).toBeInTheDocument();
      await userEvent.click(within(control).getByRole("button", { name: t("orderPause.pause") }));
      const dialog = screen.getByRole("dialog", { name: t("orderPause.modalTitle") });
      await userEvent.click(within(dialog).getByLabelText(t("orderPause.options.2h")));
      await userEvent.click(within(dialog).getByRole("button", { name: t("orderPause.confirm") }));

      expect(apiMock.patch).toHaveBeenCalledWith("/users/me/order-settings", {
        orders_paused: true,
        orders_paused_until: until,
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(within(control).getByText(t("orderPause.pausedTitle"))).toBeInTheDocument();
      expect(
        within(control).getByText(
          t("orderPause.pausedText", { until: t("orderPause.untilTime", { time: "12:00" }) }),
        ),
      ).toBeInTheDocument();

      apiMock.patch.mockResolvedValueOnce(saved({}, "Orders resumed."));
      await userEvent.click(within(control).getByRole("button", { name: t("orderPause.resume") }));
      expect(apiMock.patch).toHaveBeenLastCalledWith("/users/me/order-settings", { orders_paused: false });
      await waitFor(() => expect(within(control).getByText(t("orderPause.receivingTitle"))).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses without an end until the store turns it off", async () => {
    apiMock.patch.mockResolvedValueOnce(saved({ orders_paused: true }, "Orders paused."));
    renderWithProviders(<OrderSettingsSection initial={SETTINGS} />);
    await userEvent.click(screen.getByRole("button", { name: t("orderPause.pause") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText(t("orderPause.options.untilResumed")));
    await userEvent.click(within(dialog).getByRole("button", { name: t("orderPause.confirm") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/users/me/order-settings", {
      orders_paused: true,
      orders_paused_until: null,
    });
    expect(
      await screen.findByText(t("orderPause.pausedText", { until: t("orderPause.untilResumed") })),
    ).toBeInTheDocument();
  });

  it("is on My profile for stores only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderWithProviders(<MyProfilePage />, {
      route: "/my-profile",
      path: "/my-profile",
      user: makeUser({ role: "STORE", ...SETTINGS, preparation_minutes: 45 }),
    });
    expect(await screen.findByRole("switch", { name: t("orderSettings.delivery") })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(t("orderSettings.preparation")))).toHaveValue("45");
    unmount();

    renderWithProviders(<MyProfilePage />, {
      route: "/my-profile",
      path: "/my-profile",
      user: makeUser({ role: "RESTAURANT" }),
    });
    expect(await screen.findByRole("switch", { name: t("user.emailNotifications.label") })).toBeInTheDocument();
    expect(screen.queryByText(t("orderSettings.title"))).not.toBeInTheDocument();
  });
});
