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

    expect(await screen.findByText("Market Centar")).toBeInTheDocument();
    expect(screen.getByText(t("admin.users.count", { count: 3 }))).toBeInTheDocument();
    // An account created by an admin has only an email until the profile is filled in.
    const incomplete = screen.getAllByText("novi@test.com")[0]!.closest("tr")!;
    expect(within(incomplete).getByText(t("admin.common.incompleteProfile"))).toBeInTheDocument();
    const blockedRow = screen.getByText("blok@test.com").closest("tr")!;
    expect(within(blockedRow).getByText(t("admin.common.blocked"))).toBeInTheDocument();
  });

  it("sends the filters and pages through the list", async () => {
    const respond = vi.fn(() => ({ users: [store], total: 60 }));
    renderPage(respond);
    await screen.findByText("Market Centar");

    await userEvent.selectOptions(screen.getByLabelText(t("admin.users.columnRole")), "STORE");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ role: "STORE", offset: 0 })));

    await userEvent.click(screen.getByRole("button", { name: t("admin.common.next") }));
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
  });

  it("opens a user", async () => {
    renderPage(() => ({ users: [store], total: 1 }));
    await userEvent.click(await screen.findByText("Market Centar"));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/users/5");
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
    expect(within(dialog).getByText(t("admin.common.reasonRequired"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Lažni proizvodi");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.confirmBlock") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users/5/block", { reason: "Lažni proizvodi" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Account blocked."));
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

  const fill = async () => {
    await userEvent.click(await screen.findByRole("radio", { name: new RegExp(t("admin.roles.RESTAURANT")) }));
    await userEvent.type(screen.getByLabelText(t("admin.createUser.email")), "novi@test.com");
    await userEvent.type(screen.getByLabelText(t("admin.createUser.password")), "lozinka123");
    await userEvent.click(screen.getByRole("button", { name: t("admin.createUser.submit") }));
  };

  it("creates an account with only the role, email and password", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "User created successfully.", user: { id: 9 } } });
    renderPage();

    await fill();
    expect(apiMock.post).toHaveBeenCalledWith("/admin/users", {
      role: "RESTAURANT",
      email: "novi@test.com",
      password: "lozinka123",
    });
    expect(await screen.findByTestId("location")).toHaveTextContent("/admin/users/9");
  });

  it("shows the server's reason when the account is not created", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "A user with this email already exists."));
    renderPage();

    await fill();
    expect(await screen.findByText("A user with this email already exists.")).toBeInTheDocument();
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

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ store_id: "5" }));
    expect(screen.getByText(t("admin.products.filteredByUser"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("admin.common.remove") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Neispravan opis");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.common.remove") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/admin/products/10", { data: { reason: "Neispravan opis" } });
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
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

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ user_id: "5" }));
    expect(screen.getByText(t("admin.reservations.late"))).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole("button", { name: t("admin.reservations.cancel") });
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
