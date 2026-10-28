import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AdminUserDetailsPage from "./AdminUserDetailsPage.js";
import AdminAnnouncementsPage from "./AdminAnnouncementsPage.js";
import AnnouncementBanner from "../../components/AnnouncementBanner.js";
import i18n from "../../i18n/config.js";
import { getNotificationText } from "../../utils/notifications.js";
import { apiMock, axiosError, makeNotification, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminAnnouncement, Announcement } from "../../types/index.js";

const admin = makeUser({ id: 1, role: "ADMIN", email: "admin@test.com" });
const store = makeUser({
  id: 5,
  role: "STORE",
  email: "market@test.com",
  business_name: "Market Centar",
  city: "Sarajevo",
  city_id: 1,
  phone: "061111111",
  address: "Titova 1",
  is_blocked: false,
});
const counts = {
  products: 0,
  active_products: 0,
  reservations: 0,
  pending_reservations: 0,
  completed_reservations: 0,
  donations: 0,
};

describe("Editing a profile as admin", () => {
  it("sends the corrected fields and reloads the user", async () => {
    const respond = vi.fn(() => ({ user: store, counts, actions: [] }));
    apiMock.put.mockResolvedValue({ data: { message: "User profile updated." } });
    const success = vi.spyOn(toast, "success");
    renderWithProviders(<AdminUserDetailsPage />, {
      route: "/admin/users/5",
      path: "/admin/users/:id",
      user: admin,
      get: { "/admin/users/5": respond },
    });

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.editProfile") }));
    const dialog = screen.getByRole("dialog");
    const city = within(dialog).getByLabelText(t("admin.userDetails.city"));
    await waitFor(() => expect(city).toHaveDisplayValue("Sarajevo"));
    await userEvent.selectOptions(city, "Zenica");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.saveProfile") }));

    expect(apiMock.put).toHaveBeenCalledWith(
      "/admin/users/5/profile",
      expect.objectContaining({ business_name: "Market Centar", city_id: "3", phone: "061111111" }),
    );
    await waitFor(() => expect(success).toHaveBeenCalledWith("User profile updated."));
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
  });

  it("does not save a business profile with an empty required field", async () => {
    renderWithProviders(<AdminUserDetailsPage />, {
      route: "/admin/users/5",
      path: "/admin/users/:id",
      user: admin,
      get: { "/admin/users/5": { user: store, counts, actions: [] } },
    });

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.editProfile") }));
    const dialog = screen.getByRole("dialog");
    const city = within(dialog).getByLabelText(t("admin.userDetails.city"));
    expect(city).toHaveAttribute("aria-required", "true");
    expect(within(dialog).getByLabelText(t("admin.userDetails.openingHours"))).not.toHaveAttribute("aria-required");
    await waitFor(() => expect(city).toHaveDisplayValue("Sarajevo"));
    await userEvent.selectOptions(city, t("cities.choose"));
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.saveProfile") }));

    expect(apiMock.put).not.toHaveBeenCalled();
    expect(city).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(city).toHaveFocus();
  });

  it("keeps the dialog open with the server's message on a validation error", async () => {
    apiMock.put.mockRejectedValue(axiosError(400, "First name, last name, business name, city, address and phone are required."));
    renderWithProviders(<AdminUserDetailsPage />, {
      route: "/admin/users/5",
      path: "/admin/users/:id",
      user: admin,
      get: { "/admin/users/5": { user: store, counts, actions: [] } },
    });

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.editProfile") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.saveProfile") }));
    expect(await within(dialog).findByText("First name, last name, business name, city, address and phone are required.")).toBeInTheDocument();
  });
});

describe("AdminAnnouncementsPage", () => {
  const sent: AdminAnnouncement = {
    id: 3,
    audience: "RESTAURANT",
    title_bs: "Novi rok",
    body_bs: "Preuzimanje do 20h.",
    title_en: null,
    body_en: null,
    created_at: "2026-10-20T10:00:00.000Z",
    expires_at: null,
    ended_at: null,
    admin_email: "admin@test.com",
    is_active: true,
    recipients: 12,
    dismissed: 2,
  };

  const renderPage = (respond: () => unknown = () => ({ announcements: [sent], total: 1 })) =>
    renderWithProviders(<AdminAnnouncementsPage />, {
      route: "/admin/announcements",
      path: "/admin/announcements",
      user: admin,
      get: { "/admin/announcements": respond },
    });

  it("sends an announcement to the chosen audience after confirming", async () => {
    apiMock.post.mockResolvedValue({ data: { recipients: 4 } });
    const success = vi.spyOn(toast, "success");
    renderPage();

    await userEvent.click(await screen.findByRole("radio", { name: new RegExp(t("admin.announcements.audiences.STORE")) }));
    const [titleBs] = screen.getAllByLabelText(t("admin.announcements.titleLabel"), { exact: true });
    await userEvent.type(titleBs!, "Praznik");
    const [bodyBs] = screen.getAllByLabelText(t("admin.announcements.bodyLabel"), { exact: true });
    await userEvent.type(bodyBs!, "Platforma radi skraćeno.");
    await userEvent.click(screen.getByRole("button", { name: t("admin.announcements.send") }));

    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.announcements.confirmSend") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/announcements", {
      audience: "STORE",
      title_bs: "Praznik",
      body_bs: "Platforma radi skraćeno.",
      title_en: "",
      body_en: "",
      expires_at: null,
    });
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("admin.announcements.sent", { count: 4 })));
  });

  it("shows the server's reason in a toast when sending fails and keeps the text", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "The announcement title is too long."));
    const errorToast = vi.spyOn(toast, "error");
    renderPage();

    const [titleBs] = await screen.findAllByLabelText(t("admin.announcements.titleLabel"), { exact: true });
    await userEvent.type(titleBs!, "Praznik");
    const [bodyBs] = screen.getAllByLabelText(t("admin.announcements.bodyLabel"), { exact: true });
    await userEvent.type(bodyBs!, "Platforma radi skraćeno.");
    await userEvent.click(screen.getByRole("button", { name: t("admin.announcements.send") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("admin.announcements.confirmSend") }));

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("The announcement title is too long."));
    expect(screen.queryByText("The announcement title is too long.")).not.toBeInTheDocument();
    expect(titleBs).toHaveValue("Praznik");
  });

  it("lists sent announcements and ends an active one", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Announcement ended." } });
    renderPage();

    expect(await screen.findByText("Novi rok")).toBeInTheDocument();
    expect(screen.getByText("12 / 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("admin.announcements.end") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("admin.announcements.end") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/announcements/3/end");
  });
});

describe("AdminAnnouncementsPage validation", () => {
  it("requires the Bosnian text, and the English title and text only together", async () => {
    renderWithProviders(<AdminAnnouncementsPage />, {
      route: "/admin/announcements",
      path: "/admin/announcements",
      user: admin,
      get: { "/admin/announcements": { announcements: [], total: 0 } },
    });
    const [titleBs] = await screen.findAllByLabelText(t("admin.announcements.titleLabel"), { exact: true });
    const titleEn = screen.getByLabelText(`${t("admin.announcements.titleLabel")} (EN)`);
    const bodyEn = screen.getByLabelText(`${t("admin.announcements.bodyLabel")} (EN)`);
    expect(titleBs).toHaveAttribute("aria-required", "true");
    expect(titleEn).not.toHaveAttribute("aria-required");
    expect(bodyEn).not.toHaveAttribute("aria-required");

    await userEvent.type(titleEn, "New deadline");
    expect(bodyEn).toHaveAttribute("aria-required", "true");
    expect(titleEn).not.toHaveAttribute("aria-required");

    await userEvent.click(screen.getByRole("button", { name: t("admin.announcements.send") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(titleBs).toHaveFocus();
    expect(bodyEn).toHaveAccessibleDescription(t("common.fieldRequired"));

    await userEvent.clear(titleEn);
    expect(bodyEn).not.toHaveAttribute("aria-required");
    expect(bodyEn).not.toHaveAttribute("aria-invalid");
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("AnnouncementBanner", () => {
  const announcement: Announcement = {
    id: 8,
    title_bs: "Održavanje",
    body_bs: "Večeras od 22h.",
    title_en: "Maintenance",
    body_en: "Tonight from 10pm.",
    created_at: "2026-10-20T10:00:00.000Z",
  };

  const renderBanner = (announcements: Announcement[], role: "STORE" | "ADMIN" = "STORE") =>
    renderWithProviders(<AnnouncementBanner />, {
      user: makeUser({ role }),
      get: { "/announcements/active": { announcements } },
    });

  it("shows the text in the interface language and falls back to Bosnian", async () => {
    await i18n.changeLanguage("en");
    renderBanner([announcement, { ...announcement, id: 9, title_bs: "Samo bosanski", title_en: null, body_en: null }]);
    expect(await screen.findByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Samo bosanski")).toBeInTheDocument();
  });

  it("hides a dismissed announcement and tells the server", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    const success = vi.spyOn(toast, "success");
    const errorToast = vi.spyOn(toast, "error");
    renderBanner([announcement]);
    await userEvent.click(await screen.findByRole("button", { name: t("announcements.dismiss") }));
    expect(screen.queryByText("Održavanje")).not.toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith("/announcements/8/dismiss");
    // Disappearing is the feedback.
    expect(success).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("says so when the server does not record the dismissal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(500));
    const errorToast = vi.spyOn(toast, "error");
    renderBanner([announcement]);
    await userEvent.click(await screen.findByRole("button", { name: t("announcements.dismiss") }));
    expect(screen.queryByText("Održavanje")).not.toBeInTheDocument();
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(t("announcements.dismissError")));
  });

  it("does not load announcements for an admin", async () => {
    renderBanner([announcement], "ADMIN");
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/users/me"));
    expect(apiMock.get).not.toHaveBeenCalledWith("/announcements/active");
  });
});

describe("announcement notifications", () => {
  it("use the title in the interface language", () => {
    const notification = makeNotification({
      type: "PLATFORM_ANNOUNCEMENT",
      product_name: null,
      announcement_id: 8,
      announcement_title_bs: "Održavanje",
      announcement_title_en: "Maintenance",
    });
    expect(getNotificationText(notification, t, "en")).toBe(
      t("notifications.types.PLATFORM_ANNOUNCEMENT", { title: "Maintenance" }),
    );
    expect(getNotificationText({ ...notification, announcement_title_en: null }, t, "en")).toBe(
      t("notifications.types.PLATFORM_ANNOUNCEMENT", { title: "Održavanje" }),
    );
  });
});
