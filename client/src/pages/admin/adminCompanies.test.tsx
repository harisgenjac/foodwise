import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AdminCompaniesPage from "./AdminCompaniesPage.js";
import AdminCreateCompanyPage from "./AdminCreateCompanyPage.js";
import AdminCompanyDetailsPage from "./AdminCompanyDetailsPage.js";
import AdminUsersPage from "./AdminUsersPage.js";
import AdminActionsPage from "./AdminActionsPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminCompanyDetails, AdminCompanyListItem } from "../../types/index.js";

const admin = makeUser({ id: 1, role: "ADMIN", email: "admin@test.com" });

const bingo: AdminCompanyListItem = {
  id: 3,
  name: "Bingo d.o.o.",
  hq_email: "bingo@test.com",
  branch_count: 0,
  is_blocked: false,
  created_at: "2026-10-01T10:00:00.000Z",
};

const details = (overrides: Partial<AdminCompanyDetails["company"]> = {}): AdminCompanyDetails => ({
  company: {
    id: 3,
    name: "Bingo d.o.o.",
    description: "Trgovački lanac",
    logo_url: null,
    branch_count: 0,
    is_blocked: false,
    blocked_at: null,
    blocked_reason: null,
    created_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  },
  hqUsers: [
    {
      id: 9,
      email: "bingo@test.com",
      first_name: "Selma",
      last_name: "Bingo",
      phone: "035 000 111",
      is_blocked: false,
      must_change_password: true,
      created_at: "2026-10-01T10:00:00.000Z",
    },
  ],
  branches: [],
  actions: [
    { id: 1, action: "CREATE_COMPANY", reason: null, created_at: "2026-10-01T10:00:00.000Z", admin_email: "admin@test.com" },
  ],
});

describe("AdminCompaniesPage", () => {
  const renderPage = (respond: (params: unknown) => unknown) =>
    renderWithProviders(<AdminCompaniesPage />, {
      route: "/admin/companies",
      path: "/admin/companies",
      user: admin,
      get: { "/admin/companies": respond },
    });

  it("lists companies with the HQ email, branches and status", async () => {
    const blocked = { ...bingo, id: 4, name: "Konzum", hq_email: "konzum@test.com", is_blocked: true, branch_count: 2 };
    renderPage(() => ({ companies: [bingo, blocked], total: 2 }));

    const row = (await screen.findByText("Bingo d.o.o.")).closest("tr")!;
    expect(within(row).getByText("bingo@test.com")).toBeInTheDocument();
    expect(within(row).getByText(t("admin.common.active"))).toBeInTheDocument();
    const blockedRow = screen.getByText("Konzum").closest("tr")!;
    expect(within(blockedRow).getByText(t("admin.common.blocked"))).toBeInTheDocument();
    expect(within(blockedRow).getByText("2")).toBeInTheDocument();
    expect(screen.getByText(t("admin.companies.count", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("admin.companies.newCompany") })).toHaveAttribute(
      "href",
      "/admin/companies/new",
    );
  });

  it("sends the search and the blocked filter, then opens a company", async () => {
    const respond = vi.fn(() => ({ companies: [bingo], total: 1 }));
    renderPage(respond);
    await screen.findByText("Bingo d.o.o.");

    await userEvent.type(screen.getByLabelText(t("admin.companies.search")), "bingo");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ q: "bingo", offset: 0 })));
    await userEvent.selectOptions(screen.getByLabelText(t("admin.companies.columnStatus")), "true");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ blocked: "true" })));

    await userEvent.click(screen.getByText("Bingo d.o.o."));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/companies/3");
  });

  it("shows an empty state with a link to the form", async () => {
    renderPage(() => ({ companies: [], total: 0 }));
    expect(await screen.findByText(t("admin.companies.emptyTitle"))).toBeInTheDocument();
  });
});

describe("AdminCreateCompanyPage", () => {
  const renderPage = () =>
    renderWithProviders(<AdminCreateCompanyPage />, {
      route: "/admin/companies/new",
      path: "/admin/companies/new",
      user: admin,
    });

  it("requires the name, email and password before sending", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("admin.createCompany.submit") }));
    expect(screen.getByLabelText(t("admin.createCompany.name"))).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(screen.getByLabelText(t("admin.createCompany.email"))).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("creates the company with its HQ login and opens it", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Company created successfully.", company: { id: 3 } } });
    renderPage();
    await userEvent.type(await screen.findByLabelText(t("admin.createCompany.name")), "Bingo d.o.o.");
    await userEvent.type(screen.getByLabelText(t("admin.createCompany.email")), "bingo@test.com");
    await userEvent.type(screen.getByLabelText(t("admin.createCompany.password")), "lozinka123");
    await userEvent.click(screen.getByRole("button", { name: t("admin.createCompany.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/admin/companies", {
      name: "Bingo d.o.o.",
      email: "bingo@test.com",
      password: "lozinka123",
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/companies/3"));
  });

  it("shows the server's reason and stays on the form", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Firma s ovim nazivom već postoji."));
    const error = vi.spyOn(toast, "error");
    renderPage();
    await userEvent.type(await screen.findByLabelText(t("admin.createCompany.name")), "Bingo d.o.o.");
    await userEvent.type(screen.getByLabelText(t("admin.createCompany.email")), "bingo@test.com");
    await userEvent.type(screen.getByLabelText(t("admin.createCompany.password")), "lozinka123");
    await userEvent.click(screen.getByRole("button", { name: t("admin.createCompany.submit") }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Firma s ovim nazivom već postoji."));
    expect(screen.getByRole("button", { name: t("admin.createCompany.submit") })).toBeEnabled();
  });
});

describe("AdminCompanyDetailsPage", () => {
  const renderPage = (data: AdminCompanyDetails = details()) =>
    renderWithProviders(<AdminCompanyDetailsPage />, {
      route: "/admin/companies/3",
      path: "/admin/companies/:id",
      user: admin,
      get: { "/admin/companies/3": data },
    });

  it("shows the company, its HQ login, an empty branch list and the recent actions", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Bingo d.o.o." })).toBeInTheDocument();
    expect(screen.getByText("Trgovački lanac")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "bingo@test.com" })).toHaveAttribute("href", "/admin/users/9");
    expect(screen.getByText(t("admin.common.pendingPassword"))).toBeInTheDocument();
    expect(screen.getByText(t("admin.companyDetails.noBranchesTitle"))).toBeInTheDocument();
    expect(screen.getByText(t("admin.actionTypes.CREATE_COMPANY"))).toBeInTheDocument();
  });

  it("edits the name and description", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Company updated." } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("admin.companyDetails.edit") }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText(t("admin.companyDetails.name"));
    await userEvent.clear(name);
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.companyDetails.save") }));
    expect(name).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(apiMock.put).not.toHaveBeenCalled();

    await userEvent.type(name, "Bingo BH");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.companyDetails.save") }));
    expect(apiMock.put).toHaveBeenCalledWith("/admin/companies/3", { name: "Bingo BH", description: "Trgovački lanac" });
  });

  it("blocks the company only with a reason", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Company blocked." } });
    const success = vi.spyOn(toast, "success");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("admin.companyDetails.block") }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(t("admin.companyDetails.blockText", { name: "Bingo d.o.o." }));
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.companyDetails.confirmBlock") }));
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Neplaćeno");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.companyDetails.confirmBlock") }));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/companies/3/block", { reason: "Neplaćeno" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Company blocked."));
  });

  it("shows the block reason and unblocks", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Company unblocked." } });
    renderPage(details({ is_blocked: true, blocked_reason: "Neplaćeno", blocked_at: "2026-10-20T08:00:00.000Z" }));
    expect(await screen.findByText(`${t("admin.common.reasonLabel")}: Neplaćeno`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("admin.companyDetails.unblock") }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: t("admin.companyDetails.confirmUnblock") }),
    );
    expect(apiMock.post).toHaveBeenCalledWith("/admin/companies/3/unblock");
  });

  it("shows a not-found state", async () => {
    renderWithProviders(<AdminCompanyDetailsPage />, {
      route: "/admin/companies/99",
      path: "/admin/companies/:id",
      user: admin,
      get: { "/admin/companies/99": axiosError(404, "Firma nije pronađena.") },
    });
    expect(await screen.findByText(t("admin.companyDetails.notFoundTitle"))).toBeInTheDocument();
  });
});

describe("Company HQ accounts in the other admin pages", () => {
  it("labels a COMPANY user as Company HQ with the company name in the users list", async () => {
    const hq = makeUser({
      id: 9,
      role: "COMPANY",
      email: "bingo@test.com",
      company_id: 3,
      company_name: "Bingo d.o.o.",
      phone: "035 000 111",
      created_at: "2026-10-01T10:00:00.000Z",
    });
    renderWithProviders(<AdminUsersPage />, {
      route: "/admin/users",
      path: "/admin/users",
      user: admin,
      get: { "/admin/users": () => ({ users: [hq], total: 1 }) },
    });
    const row = (await screen.findByText("bingo@test.com")).closest("tr")!;
    expect(within(row).getByText(t("admin.roles.COMPANY"))).toBeInTheDocument();
    expect(within(row).getByText("Bingo d.o.o.")).toBeInTheDocument();
    expect(within(row).getByText(t("admin.common.active"))).toBeInTheDocument();
    // The role filter offers the company role.
    expect(screen.getByRole("option", { name: t("admin.roles.COMPANY") })).toBeInTheDocument();
  });

  it("links company actions in the audit log to the company", async () => {
    renderWithProviders(<AdminActionsPage />, {
      route: "/admin/actions",
      path: "/admin/actions",
      user: admin,
      get: {
        "/admin/actions": () => ({
          actions: [
            {
              id: 1,
              action: "BLOCK_COMPANY",
              reason: "Neplaćeno",
              created_at: "2026-10-01T10:00:00.000Z",
              admin_email: "admin@test.com",
              target_company_id: 3,
              company_name: "Bingo d.o.o.",
              target_product_id: null,
              product_name: null,
              target_donation_id: null,
              donation_name: null,
            },
          ],
          total: 1,
        }),
      },
    });
    expect(await screen.findByRole("link", { name: "Bingo d.o.o." })).toHaveAttribute("href", "/admin/companies/3");
    expect(screen.getAllByText(t("admin.actionTypes.BLOCK_COMPANY")).length).toBeGreaterThan(0);
  });
});
