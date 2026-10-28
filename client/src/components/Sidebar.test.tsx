import { screen, within } from "@testing-library/react";
import Sidebar from "./Sidebar.js";
import { makeUser, renderWithProviders, t } from "../test/utils.js";

const renderSidebar = (user: ReturnType<typeof makeUser>, branchRequests = 0) =>
  renderWithProviders(<Sidebar isSidebarOpen />, {
    route: "/dashboard",
    path: "/dashboard",
    user,
    get: {
      "/admin/credits/requests/pending-count": { count: 0 },
      "/company/credits/branch-requests/count": { count: branchRequests },
    },
  });

const links = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));

describe("Sidebar", () => {
  it("shows a company headquarters only its overview, branches, credits, company profile and own profile", async () => {
    renderSidebar(makeUser({ role: "COMPANY", company_id: 3, phone: "035 000 111" }));
    expect(await screen.findByRole("link", { name: t("sidebar.companyOverview") })).toHaveAttribute("href", "/dashboard");
    expect(links()).toEqual(["/dashboard", "/company/branches", "/company/credits", "/company/profile", "/my-profile"]);
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

  it("keeps the store links and the humanitarian section for stores", async () => {
    renderSidebar(makeUser({ role: "STORE" }));
    expect(await screen.findByRole("link", { name: t("sidebar.myProducts") })).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.humanitarian"))).toBeInTheDocument();
    expect(links()).not.toContain("/company/profile");
  });
});
