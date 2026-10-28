import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import AdminProductsPage from "./AdminProductsPage.js";
import AdminCreditsPage from "./AdminCreditsPage.js";
import AdminUsersPage from "./AdminUsersPage.js";
import AdminReservationsPage from "./AdminReservationsPage.js";
import AdminDonationsPage from "./AdminDonationsPage.js";
import { apiMock, makeDonation, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminCreditUser, AdminDonation, AdminProduct, AdminReservation, Plan } from "../../types/index.js";

const admin = makeUser({ id: 1, role: "ADMIN", email: "admin@test.com" });

// The query string of the current URL, where the admin pages keep ?sort=, ?dir= and ?page=.
function SearchDisplay() {
  return <div data-testid="search">{useLocation().search}</div>;
}

const PRODUCT: AdminProduct = {
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

const CREDIT_ROW: AdminCreditUser = {
  id: 3,
  email: "store@demo.com",
  role: "STORE",
  business_name: "Market Centar",
  is_blocked: false,
  company_name: null,
  pending_requests: 0,
  plan_name: "Standard",
  has_subscription: true,
  total: 50,
  used: 10,
  available: 40,
};

const RESERVATION: AdminReservation = {
  id: 20,
  status: "Pending",
  quantity: "2",
  unit_price: "5.00",
  pickup_date: "2030-01-01T10:00:00",
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
  restaurant_name: "Bistro",
  restaurant_email: "bistro@test.com",
};

const DONATION: AdminDonation = {
  ...makeDonation(),
  business_name: "Market Centar",
  donor_email: "market@test.com",
  donor_role: "STORE",
};

const PLANS: Plan[] = [
  { id: 1, name: "Basic", credits_per_period: 20, price: "15.00" },
  { id: 2, name: "Standard", credits_per_period: 50, price: "30.00" },
];

const lastParams = (url: string) => apiMock.get.mock.calls.filter(([called]) => called === url).at(-1)?.[1]?.params;

const renderProducts = (route = "/admin/products") =>
  renderWithProviders(
    <>
      <AdminProductsPage />
      <SearchDisplay />
    </>,
    {
      route,
      path: "/admin/products",
      user: admin,
      get: { "/admin/products": () => ({ products: [PRODUCT], total: 60 }) },
    },
  );

const renderCredits = (route = "/admin/credits") =>
  renderWithProviders(
    <>
      <AdminCreditsPage />
      <SearchDisplay />
    </>,
    {
      route,
      path: "/admin/credits",
      user: admin,
      get: {
        "/admin/credits/overview": () => ({ users: [CREDIT_ROW], total: 60 }),
        "/admin/credits/plans": { plans: PLANS },
      },
    },
  );

const header = (name: string) => screen.getByRole("columnheader", { name });
const sortButton = (name: string) => within(header(name)).getByRole("button", { name });
const icon = (cell: HTMLElement) => cell.querySelector("svg")!;

describe("sortable admin tables", () => {
  it("cycles a column through unsorted, ascending, descending and unsorted with matching icons", async () => {
    renderProducts();
    await screen.findByText("Piletina");
    const price = t("admin.products.columnPrice");

    expect(header(price)).toHaveAttribute("aria-sort", "none");
    expect(icon(header(price))).toHaveClass("lucide-arrow-up-down", "text-gray-400");
    expect(lastParams("/admin/products")).toMatchObject({ sort: "", dir: "" });

    await userEvent.click(sortButton(price));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=discounted_price&dir=asc");
    expect(header(price)).toHaveAttribute("aria-sort", "ascending");
    expect(icon(header(price))).toHaveClass("lucide-arrow-up", "text-orange-500");
    await waitFor(() => expect(lastParams("/admin/products")).toMatchObject({ sort: "discounted_price", dir: "asc" }));

    await userEvent.click(sortButton(price));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=discounted_price&dir=desc");
    expect(header(price)).toHaveAttribute("aria-sort", "descending");
    expect(icon(header(price))).toHaveClass("lucide-arrow-down", "text-orange-500");
    await waitFor(() => expect(lastParams("/admin/products")).toMatchObject({ sort: "discounted_price", dir: "desc" }));

    await userEvent.click(sortButton(price));
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    expect(header(price)).toHaveAttribute("aria-sort", "none");
    expect(icon(header(price))).toHaveClass("lucide-arrow-up-down");
    await waitFor(() => expect(lastParams("/admin/products")).toMatchObject({ sort: "", dir: "" }));
  });

  it("sorts one column at a time", async () => {
    renderProducts("/admin/products?sort=discounted_price&dir=desc");
    await screen.findByText("Piletina");
    const price = t("admin.products.columnPrice");
    const expiry = t("admin.products.columnExpiry");

    await userEvent.click(sortButton(expiry));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=expiry_date&dir=asc");
    expect(header(expiry)).toHaveAttribute("aria-sort", "ascending");
    expect(header(price)).toHaveAttribute("aria-sort", "none");
    expect(icon(header(price))).toHaveClass("lucide-arrow-up-down");
  });

  it("reads the sort from the URL and goes back to page 1 when it changes", async () => {
    renderProducts("/admin/products?sort=expiry_date&dir=desc&page=3");
    await screen.findByText("Piletina");
    expect(lastParams("/admin/products")).toMatchObject({ sort: "expiry_date", dir: "desc", offset: 40 });
    expect(header(t("admin.products.columnExpiry"))).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(sortButton(t("admin.products.columnExpiry")));
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    await waitFor(() => expect(lastParams("/admin/products")).toMatchObject({ sort: "", offset: 0 }));
  });

  it("keeps the sort when the page changes", async () => {
    renderProducts("/admin/products?sort=expiry_date&dir=asc");
    await screen.findByText("Piletina");
    await userEvent.click(screen.getByRole("button", { name: t("admin.common.next") }));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=expiry_date&dir=asc&page=2");
    await waitFor(() => expect(lastParams("/admin/products")).toMatchObject({ sort: "expiry_date", offset: 20 }));
  });

  it("ignores a column in the URL that the table cannot sort by", async () => {
    renderProducts("/admin/products?sort=name&dir=asc");
    await screen.findByText("Piletina");
    expect(lastParams("/admin/products")).toMatchObject({ sort: "", dir: "" });
  });

  it("sorts with the keyboard", async () => {
    renderProducts();
    await screen.findByText("Piletina");
    sortButton(t("admin.products.columnExpiry")).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=expiry_date&dir=asc");
    await userEvent.keyboard(" ");
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=expiry_date&dir=desc");
  });

  it.each([
    ["users", AdminUsersPage, "/admin/users", { users: [{ ...makeUser({ id: 4, role: "STORE" }), created_at: "2026-10-01T10:00:00.000Z" }] }, "admin.users.columnCreated", "created_at"],
    ["reservations", AdminReservationsPage, "/admin/reservations", { reservations: [RESERVATION] }, "admin.reservations.columnPickup", "pickup_date"],
    ["donations", AdminDonationsPage, "/admin/donations", { donations: [DONATION] }, "admin.donations.columnExpiry", "expiry_date"],
  ])("makes the %s table sortable", async (_name, Page, url, rows, label, sortKey) => {
    renderWithProviders(
      <>
        <Page />
        <SearchDisplay />
      </>,
      { route: url, path: url, user: admin, get: { [url]: { ...rows, total: 1 } } },
    );
    await screen.findByRole("columnheader", { name: t(label) });
    expect(header(t(label))).toHaveAttribute("aria-sort", "none");

    await userEvent.click(sortButton(t(label)));
    expect(screen.getByTestId("search")).toHaveTextContent(`?sort=${sortKey}&dir=asc`);
    expect(header(t(label))).toHaveAttribute("aria-sort", "ascending");
    await waitFor(() => expect(lastParams(url)).toMatchObject({ sort: sortKey, dir: "asc" }));
  });
});

describe("admin credits sorting and plan filter", () => {
  it("sorts by used, available, total and usage", async () => {
    renderCredits();
    await screen.findByText("Market Centar");
    for (const [label, key] of [
      ["admin.credits.columnUsed", "used"],
      ["admin.credits.columnAvailable", "available"],
      ["admin.credits.columnTotal", "total"],
      ["admin.credits.columnUsage", "usage"],
    ] as const) {
      await userEvent.click(sortButton(t(label)));
      expect(screen.getByTestId("search")).toHaveTextContent(`?sort=${key}&dir=asc`);
      await waitFor(() => expect(lastParams("/admin/credits/overview")).toMatchObject({ sort: key, dir: "asc" }));
    }
    expect(header(t("admin.credits.columnUsage"))).toHaveAttribute("aria-sort", "ascending");
    expect(header(t("admin.credits.columnUsed"))).toHaveAttribute("aria-sort", "none");
  });

  it("filters by plan through the URL, with every active plan and No subscription", async () => {
    renderCredits("/admin/credits?page=2&sort=used&dir=desc");
    await screen.findByText("Market Centar");
    const select = screen.getByLabelText(t("admin.credits.columnPlan"));
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(4));
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      t("admin.credits.allPlans"),
      "Basic",
      "Standard",
      t("admin.credits.noPlan"),
    ]);

    await userEvent.selectOptions(select, "2");
    // Back to page 1; the sort stays.
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=used&dir=desc&plan=2");
    await waitFor(() =>
      expect(lastParams("/admin/credits/overview")).toMatchObject({ plan: "2", sort: "used", dir: "desc", offset: 0 }),
    );

    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=used&dir=desc");
    await waitFor(() => expect(lastParams("/admin/credits/overview")).toMatchObject({ plan: "" }));
  });

  it("opens with the plan from the URL (the dashboard's ?plan=none)", async () => {
    renderCredits("/admin/credits?plan=none");
    await screen.findByText("Market Centar");
    expect(lastParams("/admin/credits/overview")).toMatchObject({ plan: "none" });
    await waitFor(() => expect(screen.getByLabelText(t("admin.credits.columnPlan"))).toHaveValue("none"));
  });
});
