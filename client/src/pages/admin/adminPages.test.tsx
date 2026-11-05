import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AdminUsersPage from "./AdminUsersPage.js";
import AdminUserDetailsPage from "./AdminUserDetailsPage.js";
import AdminCreateUserPage from "./AdminCreateUserPage.js";
import AdminProductsPage from "./AdminProductsPage.js";
import AdminReservationsPage from "./AdminReservationsPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminProduct, AdminReservation, User } from "../../types/index.js";

// jsdom renders both the table (md up) and the phone cards (DataTable); list checks use the table.
const findInTable = async (text: string) => within(await screen.findByRole("table")).getByText(text);

const admin = makeUser({ id: 1, role: "ADMIN", email: "admin@test.com" });

const store = makeUser({
  id: 5,
  role: "STORE",
  email: "market@test.com",
  business_name: "Market Centar",
  city: "Sarajevo",
  is_blocked: false,
  created_at: "2026-10-01T10:00:00.000Z",
});

const counts = {
  products: 3,
  active_products: 2,
  reservations: 4,
  pending_reservations: 1,
  completed_reservations: 2,
  donations: 1,
};

describe("AdminUsersPage", () => {
  const renderPage = (respond: (params: unknown) => unknown) =>
    renderWithProviders(<AdminUsersPage />, {
      route: "/admin/users",
      path: "/admin/users",
      user: admin,
      get: { "/admin/users": respond },
    });

  it("lists users with their role and status", async () => {
    const newStore = makeUser({ id: 6, role: "STORE", email: "novi@test.com", first_name: null, last_name: null });
    const blocked = makeUser({ id: 7, email: "blok@test.com", business_name: "Restoran", is_blocked: true });
    renderPage(() => ({ users: [store, newStore, blocked], total: 3 }));

    expect(await findInTable("Market Centar")).toBeInTheDocument();
    expect(screen.getByText(t("admin.users.count", { count: 3 }))).toBeInTheDocument();
    // An account created by an admin has only an email until the profile is filled in.
    const incomplete = screen.getAllByText("novi@test.com")[0]!.closest("tr")!;
    expect(within(incomplete).getByText(t("admin.common.incompleteProfile"))).toBeInTheDocument();
    const blockedRow = within(screen.getByRole("table")).getByText("blok@test.com").closest("tr")!;
    expect(within(blockedRow).getByText(t("admin.common.blocked"))).toBeInTheDocument();
  });

  it("sends the filters and pages through the list", async () => {
    const respond = vi.fn(() => ({ users: [store], total: 60 }));
    renderPage(respond);
    await findInTable("Market Centar");

    await userEvent.selectOptions(screen.getByLabelText(t("admin.users.columnRole")), "STORE");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ role: "STORE", offset: 0 })));

    await userEvent.click(screen.getByRole("button", { name: t("admin.common.next") }));
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 })));

    // A city from the list, sent as its id; choosing one goes back to the first page.
    const city = screen.getByLabelText(t("cities.label"));
    expect(city).toHaveDisplayValue(t("cities.all"));
    await screen.findByRole("option", { name: "Zenica" });
    await userEvent.selectOptions(city, "Zenica");
    await waitFor(() =>
      expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ city_id: "3", offset: 0 })),
    );
    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ city_id: "" })));
  });

  it("opens a user", async () => {
    renderPage(() => ({ users: [store], total: 1 }));
    await userEvent.click(await findInTable("Market Centar"));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/users/5");
  });
});

describe("AdminUsersPage on phones (cards)", () => {
  it("shows each user as a card with the status, role, city and creation date, sorted by a select", async () => {
    const respond = vi.fn(() => ({ users: [store], total: 1 }));
    renderWithProviders(<AdminUsersPage />, { route: "/admin/users", path: "/admin/users", user: admin, get: { "/admin/users": respond } });
    const card = within((await screen.findAllByTestId("data-card"))[0]!);
    expect(card.getByRole("link", { name: /Market Centar/ })).toHaveAttribute("href", "/admin/users/5");
    expect(card.getByText(t("admin.roles.STORE"))).toBeInTheDocument();
    expect(card.getAllByRole("term").map((term) => term.textContent)).toEqual([
      t("admin.users.columnRole"),
      t("admin.users.columnCity"),
      t("admin.users.columnCreated"),
    ]);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t("filters.sortBy") }), "created_at:desc");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "created_at", dir: "desc", offset: 0 })));
  });
});

describe("AdminUserDetailsPage", () => {
  const renderPage = (user: User = store) =>
    renderWithProviders(<AdminUserDetailsPage />, {
      route: `/admin/users/${user.id}`,
      path: "/admin/users/:id",
      user: admin,
      get: { [`/admin/users/${user.id}`]: { user, counts, actions: [] } },
    });

  it("blocks an account only with a reason", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Account blocked." } });
    const success = vi.spyOn(toast, "success");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.block") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.confirmBlock") }));
    const reason = within(dialog).getByLabelText(t("admin.common.reasonLabel"));
    expect(reason).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(reason).toHaveFocus();
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.type(reason, "Lažni proizvodi");
    expect(reason).not.toHaveAttribute("aria-invalid");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.confirmBlock") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users/5/block", { reason: "Lažni proizvodi" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Account blocked."));
  });

  it("resends the invitation only while the user never logged in", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Pozivnica je poslana." } });
    const success = vi.spyOn(toast, "success");
    renderPage({ ...store, last_login_at: null });

    expect(await screen.findByText(t("admin.userDetails.neverLoggedIn"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("admin.userDetails.resendInvitation") }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(store.email);
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.confirmSend") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users/5/invitation");
    await waitFor(() => expect(success).toHaveBeenCalledWith("Pozivnica je poslana."));
  });

  it("sends a password reset link, and no invitation after the first login", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Link za novu lozinku je poslan." } });
    renderPage({ ...store, last_login_at: "2026-11-01T10:00:00Z" });

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.sendResetLink") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("admin.userDetails.confirmSend") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users/5/password-reset-link");
    expect(screen.queryByRole("button", { name: t("admin.userDetails.resendInvitation") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("admin.userDetails.neverLoggedIn"))).not.toBeInTheDocument();
  });

  it("offers no emailed links for a blocked account", async () => {
    renderPage({ ...store, is_blocked: true, blocked_reason: "Spam", last_login_at: null });
    expect(await screen.findByRole("button", { name: t("admin.userDetails.unblock") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("admin.userDetails.sendResetLink") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("admin.userDetails.resendInvitation") })).not.toBeInTheDocument();
  });

  it("shows the account activity", async () => {
    renderWithProviders(<AdminUserDetailsPage />, {
      route: `/admin/users/${store.id}`,
      path: "/admin/users/:id",
      user: admin,
      get: {
        [`/admin/users/${store.id}`]: {
          user: store,
          counts,
          actions: [],
          events: [{ id: 1, event: "PASSWORD_RESET", ip: "10.0.0.1", created_at: "2026-11-05T10:00:00Z" }],
        },
      },
    });
    expect(await screen.findByText(t("admin.accountEvents.PASSWORD_RESET"))).toBeInTheDocument();
    expect(screen.getByText(t("admin.userDetails.fromIp", { ip: "10.0.0.1" }), { exact: false })).toBeInTheDocument();
  });

  it("shows the block reason and offers unblocking", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Account unblocked." } });
    renderPage({ ...store, is_blocked: true, blocked_reason: "Kršenje pravila", blocked_at: "2026-10-20T08:00:00.000Z" });

    expect(await screen.findByText(`${t("admin.common.reasonLabel")}: Kršenje pravila`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("admin.userDetails.unblock") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("admin.userDetails.confirmUnblock") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users/5/unblock");
  });

  it("does not offer blocking the admin's own account", async () => {
    renderPage(admin);
    expect(await screen.findByText(t("admin.userDetails.ownAccount"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("admin.userDetails.block") })).not.toBeInTheDocument();
  });

  it("sets a new password once both fields match", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Password changed successfully." } });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.setPassword") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.userDetails.newPassword")), "nova-lozinka");
    await userEvent.type(within(dialog).getByLabelText(t("admin.userDetails.confirmPassword")), "druga-lozinka");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.savePassword") }));
    expect(within(dialog).getByText(t("admin.userDetails.passwordMismatch"))).toBeInTheDocument();
    expect(apiMock.patch).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText(t("admin.userDetails.confirmPassword")));
    await userEvent.type(within(dialog).getByLabelText(t("admin.userDetails.confirmPassword")), "nova-lozinka");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.savePassword") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/admin/users/5/password", { password: "nova-lozinka" });
  });

  it("shows the server's reason when an action fails", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Account is already blocked."));
    const error = vi.spyOn(toast, "error");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: t("admin.userDetails.block") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Test");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.confirmBlock") }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Account is already blocked."));
  });
});

describe("AdminCreateUserPage", () => {
  const renderPage = () =>
    renderWithProviders(<AdminCreateUserPage />, { route: "/admin/users/new", path: "/admin/users/new", user: admin });

  const methodRadio = (method: "INVITE" | "PASSWORD") =>
    screen.getByRole("radio", { name: new RegExp(t(`admin.createUser.methods.${method}.title`)) });

  // A restaurant with a temporary password (the invitation is the default).
  const fill = async () => {
    await userEvent.click(await screen.findByRole("radio", { name: new RegExp(t("admin.roles.RESTAURANT")) }));
    await userEvent.type(screen.getByLabelText(t("admin.createUser.email")), "novi@test.com");
    await userEvent.click(methodRadio("PASSWORD"));
    await userEvent.type(screen.getByLabelText(t("admin.createUser.password")), "lozinka123");
    await userEvent.click(screen.getByRole("button", { name: t("admin.createUser.submit") }));
  };

  it("sends an invitation by default, without a password field", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Nalog je kreiran i pozivnica je poslana.", user: { id: 9 } } });
    const success = vi.spyOn(toast, "success");
    renderPage();

    expect(await screen.findByRole("radio", { name: new RegExp(t("admin.createUser.methods.INVITE.title")) })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByLabelText(t("admin.createUser.password"))).not.toBeInTheDocument();
    expect(screen.getByText(t("admin.createUser.infoTextInvite"))).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(t("admin.createUser.email")), "novi@test.com");
    await userEvent.click(screen.getByRole("button", { name: t("admin.createUser.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/admin/users", { role: "STORE", email: "novi@test.com", method: "INVITE" });
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("admin.createUser.successInvite")));
    expect(await screen.findByTestId("location")).toHaveTextContent("/admin/users/9");
  });

  it("creates an account with a temporary password when chosen", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "User created successfully.", user: { id: 9 } } });
    renderPage();

    await fill();
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users", {
      role: "RESTAURANT",
      email: "novi@test.com",
      method: "PASSWORD",
      password: "lozinka123",
    });
    expect(await screen.findByTestId("location")).toHaveTextContent("/admin/users/9");
  });

  it("asks for the temporary password only when that is chosen", async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText(t("admin.createUser.email")), "novi@test.com");
    await userEvent.click(methodRadio("PASSWORD"));
    await userEvent.click(screen.getByRole("button", { name: t("admin.createUser.submit") }));
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t("admin.createUser.password"))).toHaveAccessibleDescription(t("common.fieldRequired"));
  });

  it("shows the server's reason in a toast when the account is not created", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "A user with this email already exists."));
    const errorToast = vi.spyOn(toast, "error");
    renderPage();

    await fill();
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("A user with this email already exists."));
    expect(screen.queryByText("A user with this email already exists.")).not.toBeInTheDocument();
  });
});

describe("AdminProductsPage", () => {
  const product: AdminProduct = {
    id: 10,
    store_id: 5,
    name: "Piletina",
    category: "Meat",
    quantity: "8",
    unit: "kg",
    original_price: "10.00",
    discounted_price: "5.00",
    expiry_date: "2030-01-01",
    status: "Available",
    created_at: "2026-10-01T10:00:00.000Z",
    business_name: "Market Centar",
    store_email: "market@test.com",
    store_is_blocked: false,
  };

  it("filters by the store from the link and removes a product with a reason", async () => {
    const respond = vi.fn(() => ({ products: [product], total: 1 }));
    apiMock.delete.mockResolvedValue({ data: { message: "Product removed." } });
    renderWithProviders(<AdminProductsPage />, {
      route: "/admin/products?store_id=5",
      path: "/admin/products",
      user: admin,
      get: { "/admin/products": respond },
    });

    expect(await findInTable("Piletina")).toBeInTheDocument();
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ store_id: "5" }));
    expect(screen.getByText(t("admin.products.filteredByUser"))).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole("table")).getByRole("button", { name: t("admin.common.remove") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Neispravan opis");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.common.remove") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/admin/products/10", { data: { reason: "Neispravan opis" } });
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
  });
});

describe("AdminProductsPage on phones (cards)", () => {
  it("puts Remove on the card as a full-width button that opens the reason dialog", async () => {
    const product: AdminProduct = {
      id: 10,
      store_id: 5,
      name: "Piletina",
      category: "Meat",
      quantity: "8",
      unit: "kg",
      original_price: "10.00",
      discounted_price: "5.00",
      expiry_date: "2030-01-01",
      status: "Available",
      created_at: "2026-10-01T10:00:00.000Z",
      business_name: "Market Centar",
      store_email: "market@test.com",
      store_is_blocked: false,
    };
    renderWithProviders(<AdminProductsPage />, {
      route: "/admin/products",
      path: "/admin/products",
      user: admin,
      get: { "/admin/products": { products: [product, { ...product, id: 11, name: "Uklonjeno", status: "Removed" }], total: 2 } },
    });
    const [available, removed] = await screen.findAllByTestId("data-card");
    expect(within(available!).getAllByRole("term").map((term) => term.textContent)).toEqual([
      t("admin.products.columnStore"),
      t("admin.products.columnPrice"),
      t("admin.products.columnExpiry"),
    ]);
    const remove = within(available!).getByRole("button", { name: t("admin.common.remove") });
    expect(remove).toHaveClass("min-h-11");
    expect(remove.parentElement).toHaveClass("*:flex-1");
    expect(within(removed!).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(remove);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("AdminReservationsPage", () => {
  const reservation = (overrides: Partial<AdminReservation>): AdminReservation => ({
    id: 20,
    status: "Pending",
    quantity: "2",
    unit_price: "5.00",
    pickup_date: "2030-01-01T10:00:00.000Z",
    picked_up_at: null,
    created_at: "2026-10-01T10:00:00.000Z",
    is_overdue: false,
    product_id: 10,
    product_name: "Piletina",
    unit: "kg",
    store_id: 5,
    store_name: "Market Centar",
    store_email: "market@test.com",
    restaurant_id: 6,
    restaurant_name: "Restoran Ukus",
    restaurant_email: "ukus@test.com",
    ...overrides,
  });

  it("offers cancelling only open reservations and sends the reason", async () => {
    const respond = vi.fn(() => ({
      reservations: [
        reservation({ id: 20, status: "Confirmed", product_name: "Piletina", is_overdue: true }),
        reservation({ id: 21, status: "Completed", product_name: "Hljeb" }),
      ],
      total: 2,
    }));
    apiMock.post.mockResolvedValue({ data: { message: "Reservation cancelled." } });
    renderWithProviders(<AdminReservationsPage />, {
      route: "/admin/reservations?user_id=5",
      path: "/admin/reservations",
      user: admin,
      get: { "/admin/reservations": respond },
    });

    expect(await findInTable("Piletina")).toBeInTheDocument();
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ user_id: "5" }));
    expect(within(screen.getByRole("table")).getByText(t("admin.reservations.late"))).toBeInTheDocument();
    const cancelButtons = within(screen.getByRole("table")).getAllByRole("button", { name: t("admin.reservations.cancel") });
    expect(cancelButtons).toHaveLength(1);

    await userEvent.click(cancelButtons[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t("admin.reservations.cancelTextConfirmed", { name: "Piletina" }))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.reservations.cancel") }));
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Spor oko cijene");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.reservations.cancel") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/reservations/20/cancel", { reason: "Spor oko cijene" });
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
  });
});
