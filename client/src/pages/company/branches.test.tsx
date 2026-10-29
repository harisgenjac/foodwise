import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import CompanyBranchesPage from "./CompanyBranchesPage.js";
import CompanyCreateBranchPage from "./CompanyCreateBranchPage.js";
import CompanyBranchDetailsPage from "./CompanyBranchDetailsPage.js";
import { apiMock, axiosError, makeProduct, makeReservation, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { Branch, BranchDetails, Company } from "../../types/index.js";

const hq = makeUser({ id: 9, role: "COMPANY", company_id: 3, company_name: "Bingo d.o.o.", phone: "035 000" });

const company: Company = {
  id: 3,
  name: "Bingo d.o.o.",
  description: "Lanac",
  logo_url: "/uploads/logos/company-3.png",
  branch_count: 2,
  active_branch_count: 1,
};

const visoko: Branch = {
  id: 21,
  business_name: "Bingo Visoko",
  city: "Visoko",
  address: "Alije Izetbegovića 22",
  email: "bingo.visoko@test.com",
  status: "active",
  active_products: 4,
  pending_reservations: 1,
  created_at: "2026-10-01T10:00:00.000Z",
};

const details = (overrides: Partial<BranchDetails["branch"]> = {}): BranchDetails => ({
  branch: {
    id: 21,
    email: "bingo.visoko@test.com",
    first_name: "Mirza",
    last_name: "Hadžić",
    business_name: "Bingo Visoko",
    city_id: 1,
    city: "Sarajevo",
    address: "Alije Izetbegovića 22",
    phone: "032 400",
    opening_hours: "07–21",
    pickup_hours: null,
    logo_url: "/uploads/logos/company-3.png",
    description: "Lanac",
    status: "active",
    deactivated_at: null,
    deactivated_by_email: null,
    must_change_password: false,
    created_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  },
  stats: {
    active_products: 4,
    pending_reservations: 1,
    reservations_this_month: 9,
    completed_this_month: 7,
    saved_this_month: { kg: 12.5, l: 0, pieces: 3 },
    value_this_month: 40,
  },
});

describe("CompanyBranchesPage", () => {
  const renderPage = (respond: (params: unknown) => unknown) =>
    renderWithProviders(<CompanyBranchesPage />, {
      route: "/company/branches",
      path: "/company/branches",
      user: hq,
      get: { "/company/branches": respond },
    });

  it("lists the branches with status and counts, linking to each", async () => {
    const closed = { ...visoko, id: 22, business_name: "Bingo Kakanj", status: "deactivated" as const };
    renderPage(() => ({ branches: [visoko, closed], total: 2 }));

    const card = (await screen.findByText("Bingo Visoko")).closest("a")!;
    expect(card).toHaveAttribute("href", "/company/branches/21");
    expect(within(card).getByText(t("company.branchStatus.active"))).toBeInTheDocument();
    expect(within(card).getByText(t("company.branches.activeProducts", { count: 4 }))).toBeInTheDocument();
    expect(within(screen.getByText("Bingo Kakanj").closest("a")!).getByText(t("company.branchStatus.deactivated"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("company.branches.newBranch") })).toHaveAttribute("href", "/company/branches/new");
  });

  it("sends the search, city and status filters", async () => {
    const respond = vi.fn(() => ({ branches: [visoko], total: 1 }));
    renderPage(respond);
    await screen.findByText("Bingo Visoko");

    await userEvent.type(screen.getByLabelText(t("company.branches.search")), "vis");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ q: "vis" })));
    await userEvent.selectOptions(screen.getByLabelText(t("company.branches.statusFilter")), "deactivated");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ status: "deactivated" })));
    await screen.findByRole("option", { name: "Zenica" });
    await userEvent.selectOptions(screen.getByLabelText(t("cities.label")), "Zenica");
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ city_id: "3" })));
  });

  it("shows an empty state with the create link", async () => {
    renderPage(() => ({ branches: [], total: 0 }));
    expect(await screen.findByText(t("company.branches.emptyTitle"))).toBeInTheDocument();
  });
});

describe("CompanyCreateBranchPage", () => {
  const renderPage = () =>
    renderWithProviders(<CompanyCreateBranchPage />, {
      route: "/company/branches/new",
      path: "/company/branches/new",
      user: hq,
      get: { "/company/me": { company } },
    });

  const fill = async () => {
    await userEvent.type(await screen.findByLabelText(t("company.createBranch.name")), "Bingo Breza");
    await screen.findByRole("option", { name: "Tuzla" });
    await userEvent.selectOptions(screen.getByLabelText(t("cities.label")), "Tuzla");
    await userEvent.type(screen.getByLabelText(t("user.address")), "Titova 1");
    await userEvent.type(screen.getByLabelText(t("user.phone")), "032 111");
    await userEvent.type(screen.getByLabelText(t("company.createBranch.email")), "breza@test.com");
    await userEvent.type(screen.getByLabelText(t("company.createBranch.password")), "lozinka123");
  };

  it("requires every field before sending", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("company.createBranch.submit") }));
    expect(screen.getByLabelText(t("company.createBranch.name"))).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(screen.getByLabelText(t("cities.label"))).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("previews the branch with the company's chain label, then creates it", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Branch created successfully.", branch: { id: 30 } } });
    renderPage();
    await fill();

    const preview = screen.getByTestId("branch-preview");
    expect(within(preview).getByText("Bingo Breza")).toBeInTheDocument();
    expect(within(preview).getByText("Tuzla")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(preview).getByText(t("store.chainLabel", { company: "Bingo d.o.o." }))).toBeInTheDocument(),
    );
    // No branding choice: a new branch shows the company's logo.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("company.createBranch.submit") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/branches", {
      business_name: "Bingo Breza",
      city_id: 2,
      address: "Titova 1",
      phone: "032 111",
      email: "breza@test.com",
      password: "lozinka123",
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/company/branches/30"));
  });

  it("shows the server's reason and stays on the form", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Korisnik s ovim emailom već postoji."));
    const error = vi.spyOn(toast, "error");
    renderPage();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: t("company.createBranch.submit") }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Korisnik s ovim emailom već postoji."));
  });
});

describe("CompanyBranchDetailsPage", () => {
  const renderPage = (data: BranchDetails = details(), extra: Record<string, unknown> = {}) =>
    renderWithProviders(<CompanyBranchDetailsPage />, {
      route: "/company/branches/21",
      path: "/company/branches/:id",
      user: hq,
      get: {
        "/company/branches/21": data,
        "/company/branches/21/products": () => ({ products: [makeProduct({ id: 5, name: "Mlijeko" })], total: 1 }),
        "/company/branches/21/reservations": () => ({
          reservations: [makeReservation({ id: 7, product_name: "Hljeb", status: "Pending" })],
          total: 1,
        }),
        ...extra,
      },
    });

  it("shows the data, the read-only notice and the month's numbers", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Bingo Visoko" })).toBeInTheDocument();
    expect(screen.getByText(t("company.branchDetails.readOnly"))).toBeInTheDocument();
    expect(screen.getByText("bingo.visoko@test.com")).toBeInTheDocument();
    expect(screen.getByText("12.5 kg")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("lists products and reservations without any actions, with a status filter per tab", async () => {
    const products = vi.fn(() => ({ products: [makeProduct({ id: 5, name: "Mlijeko" })], total: 1 }));
    renderPage(details(), { "/company/branches/21/products": products });

    const card = (await screen.findByRole("heading", { name: "Mlijeko" })).closest("div.rounded-2xl")!;
    expect(within(card as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t("company.branchDetails.statusFilter")), "Sold");
    await waitFor(() => expect(products).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Sold" })));

    await userEvent.click(screen.getByRole("tab", { name: t("company.branchDetails.reservationsTab") }));
    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("reservations.accept") })).not.toBeInTheDocument();
  });

  it("edits the name, city, address and phone", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Branch updated." } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("company.branchDetails.edit") }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText(t("company.createBranch.name"));
    await userEvent.clear(name);
    await userEvent.type(name, "Bingo Visoko 2");
    await userEvent.click(within(dialog).getByRole("button", { name: t("company.branchDetails.save") }));
    expect(apiMock.put).toHaveBeenCalledWith("/company/branches/21", {
      business_name: "Bingo Visoko 2",
      city_id: 1,
      address: "Alije Izetbegovića 22",
      phone: "032 400",
    });
  });

  it("sets a new password", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Password changed successfully." } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("company.branchDetails.setPassword") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.userDetails.newPassword")), "novalozinka1");
    await userEvent.type(within(dialog).getByLabelText(t("admin.userDetails.confirmPassword")), "novalozinka1");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.userDetails.savePassword") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/company/branches/21/password", { password: "novalozinka1" });
  });

  it("deactivates after confirming and shows the refusal with accepted pickups", async () => {
    apiMock.post.mockRejectedValueOnce(
      axiosError(400, "Poslovnica još ima prihvaćena preuzimanja (2). Sačekajte da budu preuzeta ili otkazana."),
    );
    const error = vi.spyOn(toast, "error");
    renderPage();
    expect(await screen.findByText(t("company.branchDetails.deactivatePending"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("company.branchDetails.deactivate") }));
    const dialog = screen.getByRole("dialog");
    expect(apiMock.post).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: t("company.branchDetails.deactivate") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/branches/21/deactivate");
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Poslovnica još ima prihvaćena preuzimanja (2). Sačekajte da budu preuzeta ili otkazana.",
      ),
    );
    // The dialog stays open after a refusal.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reactivates a deactivated branch", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Branch reactivated." } });
    renderPage(details({ status: "deactivated", deactivated_at: "2026-10-20T08:00:00.000Z", deactivated_by_email: "bingo@test.com" }));
    expect(await screen.findByText(/bingo@test.com/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("company.branchDetails.reactivate") }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: t("company.branchDetails.reactivate") }),
    );
    expect(apiMock.post).toHaveBeenCalledWith("/company/branches/21/reactivate");
  });

  it("shows a not-found state for another company's branch", async () => {
    renderPage(details(), { "/company/branches/21": axiosError(404, "Poslovnica nije pronađena.") });
    expect(await screen.findByText(t("company.branchDetails.notFoundTitle"))).toBeInTheDocument();
  });
});
