import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import EmailNotificationsSection from "./EmailNotificationsSection.js";
import MyProfilePage from "../../pages/MyProfilePage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";

const theSwitch = () => screen.getByRole("switch", { name: t("user.emailNotifications.label") });

describe("EmailNotificationsSection", () => {
  it("turns email notifications off and on, saving at once", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Email notifications turned off." } });
    const success = vi.spyOn(toast, "success");
    renderWithProviders(<EmailNotificationsSection initial />);

    expect(theSwitch()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(t("user.emailNotifications.onHint"))).toBeInTheDocument();

    await userEvent.click(theSwitch());
    expect(apiMock.patch).toHaveBeenCalledWith("/users/me/email-notifications", { enabled: false });
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("user.emailNotifications.turnedOff")));
    expect(theSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(t("user.emailNotifications.offHint"))).toBeInTheDocument();

    await userEvent.click(theSwitch());
    expect(apiMock.patch).toHaveBeenLastCalledWith("/users/me/email-notifications", { enabled: true });
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("user.emailNotifications.turnedOn")));
    expect(theSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("goes back and shows the error when saving fails", async () => {
    apiMock.patch.mockRejectedValue(axiosError(500, "Greška prilikom spremanja email obavijesti."));
    const errorToast = vi.spyOn(toast, "error");
    renderWithProviders(<EmailNotificationsSection initial={false} />);

    await userEvent.click(theSwitch());
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Greška prilikom spremanja email obavijesti."));
    expect(theSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("is on My profile for every role, starting from the saved value", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const role of ["STORE", "ADMIN", "COMPANY"] as const) {
      const { unmount } = renderWithProviders(<MyProfilePage />, {
        route: "/my-profile",
        path: "/my-profile",
        user: makeUser({ role, email_notifications: role !== "ADMIN" }),
      });
      expect(await screen.findByRole("switch", { name: t("user.emailNotifications.label") })).toHaveAttribute(
        "aria-checked",
        role === "ADMIN" ? "false" : "true",
      );
      unmount();
    }
  });

  it("opens at the section from the emails' footer link", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderWithProviders(<EmailNotificationsSection initial />, {
      route: "/my-profile#email-notifications",
      path: "/my-profile",
    });
    expect(document.getElementById("email-notifications")).toContainElement(theSwitch());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
