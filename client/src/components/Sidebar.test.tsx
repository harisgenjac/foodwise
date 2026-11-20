import { screen, waitFor, within } from "@testing-library/react";
import Sidebar from "./Sidebar.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";

const renderSidebar = (user: ReturnType<typeof makeUser>, branchRequests = 0, pendingOrders = 0) =>
  renderWithProviders(<Sidebar isSidebarOpen />, {
    route: "/dashboard",
    path: "/dashboard",
    user,
    get: {
      "/admin/credits/requests/pending-count": { count: 0 },
      "/company/credits/branch-requests/count": { count: branchRequests },
      "/orders/store": { orders: [], total: pendingOrders },
    },
  });

const links = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));

describe("Sidebar", () => {
  it("shows a company headquarters only its overview, branches, credits, reports, company profile and own profile", async () => {
    renderSidebar(makeUser({ role: "COMPANY", company_id: 3, phone: "035 000 111" }));
    expect(await screen.findByRole("link", { name: t("sidebar.companyOverview") })).toHaveAttribute("href", "/dashboard");
    expect(links()).toEqual(["/dashboard", "/company/branches", "/company/credits", "/company/reports", "/company/profile", "/my-profile"]);
    // No marketplace, store pages or donations.
    expect(screen.queryByText(t("sidebar.humanitarian"))).not.toBeInTheDocument();
  });

  it("shows the headquarters how many branch top-ups wait for it", async () => {
    renderSidebar(makeUser({ role: "COMPANY", company_id: 3, phone: "035 000 111" }), 2);
    const credits = await screen.findByRole("link", { name: new RegExp(t("sidebar.companyCredits")) });
    expect(credits).toHaveAttribute("href", "/company/credits");
    expect(await within(credits).findByText("2")).toBeInTheDocument();
  });

  it("gives admins the companies page", async () => {
    renderSidebar(makeUser({ role: "ADMIN" }));
    expect(await screen.findByRole("link", { name: t("sidebar.adminCompanies") })).toHaveAttribute(
      "href",
      "/admin/companies",
    );
  });

  it("orders a store's links as the store home design, then the pages it does not show, then Donate food", async () => {
    renderSidebar(makeUser({ role: "STORE" }));
    expect(await screen.findByRole("link", { name: "Moji proizvodi" })).toBeInTheDocument();
    expect(links()).toEqual([
      "/dashboard",
      "/my-products",
      "/orders",
      "/packing",
      "/reports",
      "/credits",
      "/pickups",
      "/add-product",
      "/my-profile",
      "/donate-food",
      "/sponsor",
    ]);
    expect(screen.getByText(t("sidebar.humanitarian"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doniraj hranu" })).toHaveAttribute("href", "/donate-food");
  });

  it("shows a store how many orders wait for its answer, in orange, and nothing without any", async () => {
    renderSidebar(makeUser({ role: "STORE" }), 0, 3);
    const orders = await screen.findByRole("link", { name: t("sidebar.orders") });
    const badge = await within(orders).findByTestId("sidebar-badge");
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveClass("bg-accent-700");
    expect(apiMock.get).toHaveBeenCalledWith("/orders/store", { params: { status: "Pending", limit: 1 } });
  });

  it("shows no orders badge to a store with no pending orders", async () => {
    renderSidebar(makeUser({ role: "STORE" }));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/orders/store", expect.anything()));
    expect(screen.queryByTestId("sidebar-badge")).not.toBeInTheDocument();
  });

  it("keeps Donate meal for a restaurant and asks no order count", async () => {
    renderSidebar(makeUser({ role: "RESTAURANT" }));
    expect(await screen.findByRole("link", { name: t("sidebar.donateFood") })).toHaveAttribute("href", "/donate-food");
    expect(apiMock.get).not.toHaveBeenCalledWith("/orders/store", expect.anything());
  });

  it("gives restaurants no credits page: they pay no credits", async () => {
    renderSidebar(makeUser({ role: "RESTAURANT" }));
    expect(await screen.findByRole("link", { name: t("sidebar.search") })).toBeInTheDocument();
    expect(links()).not.toContain("/credits");
  });
});
