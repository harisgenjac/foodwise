import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import AdminUsersPage from "./AdminUsersPage.js";
import AdminProductsPage from "./AdminProductsPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminProduct } from "../../types/index.js";

const admin = makeUser({ id: 1, role: "ADMIN", email: "admin@test.com" });

// The query string of the current URL, where the admin page keeps ?page=.
function SearchDisplay() {
  return <div data-testid="search">{useLocation().search}</div>;
}

const users = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeUser({ id: 100 + i, role: "STORE", email: `store${i}@test.com`, business_name: `Market ${i}` }),
  );

const lastParams = (url: string) => apiMock.get.mock.calls.filter(([called]) => called === url).at(-1)?.[1]?.params;

describe("Admin paging", () => {
  it("reads the page from the URL and writes the chosen page back", async () => {
    renderWithProviders(
      <>
        <AdminUsersPage />
        <SearchDisplay />
      </>,
      {
        route: "/admin/users?page=2",
        path: "/admin/users",
        user: admin,
        get: { "/admin/users": () => ({ users: users(10), total: 100 }) },
      },
    );

    await screen.findByText("Market 0");
    expect(lastParams("/admin/users")).toMatchObject({ limit: 20, offset: 20 });
    expect(screen.getByRole("button", { name: t("admin.common.page", { page: 2 }) })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("button", { name: t("admin.common.page", { page: 5 }) }));
    expect(screen.getByTestId("search")).toHaveTextContent("?page=5");
    await waitFor(() => expect(lastParams("/admin/users")).toMatchObject({ offset: 80 }));
  });

  it("goes back to the first page when a filter changes", async () => {
    renderWithProviders(
      <>
        <AdminUsersPage />
        <SearchDisplay />
      </>,
      {
        route: "/admin/users?page=3",
        path: "/admin/users",
        user: admin,
        get: { "/admin/users": () => ({ users: users(10), total: 45 }) },
      },
    );
    await screen.findByText("Market 0");

    await userEvent.selectOptions(screen.getByLabelText(t("admin.users.columnRole")), "STORE");
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    await waitFor(() => expect(lastParams("/admin/users")).toMatchObject({ role: "STORE", offset: 0 }));
  });

  it("steps back a page when an action empties the last one", async () => {
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
    let removed = false;
    apiMock.delete.mockImplementation(async () => {
      removed = true;
      return { data: { message: "Product removed." } };
    });
    // 11 products, so page 2 holds only Piletina. After its removal the server reports 10 (as with
    // a status filter that hides removed products), so page 2 no longer exists.
    renderWithProviders(
      <>
        <AdminProductsPage />
        <SearchDisplay />
      </>,
      {
        route: "/admin/products?page=2",
        path: "/admin/products",
        user: admin,
        get: {
          "/admin/products": (params: { offset: number }) =>
            removed
              ? { products: params.offset === 0 ? [{ ...product, id: 1, name: "Mlijeko" }] : [], total: 10 }
              : { products: [product], total: 11 },
        },
      },
    );

    await screen.findByText("Piletina");
    await userEvent.click(screen.getByRole("button", { name: t("admin.common.remove") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Neispravan opis");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.common.remove") }));

    expect(await screen.findByText("Mlijeko")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    expect(lastParams("/admin/products")).toMatchObject({ offset: 0 });
  });
});
