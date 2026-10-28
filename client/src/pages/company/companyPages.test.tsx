import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import DashboardPage from "../DashboardPage.js";
import MyProfilePage from "../MyProfilePage.js";
import CompanyProfilePage from "./CompanyProfilePage.js";
import Header from "../../components/Header.js";
import { NotificationsProvider } from "../../context/NotificationsContext.js";
import { apiMock, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { Company } from "../../types/index.js";

const hq = makeUser({
  id: 9,
  role: "COMPANY",
  email: "bingo@test.com",
  first_name: "Selma",
  last_name: "Bingo",
  phone: "035 000 111",
  company_id: 3,
  company_name: "Bingo d.o.o.",
});

const company: Company = {
  id: 3,
  name: "Bingo d.o.o.",
  description: "Trgovački lanac",
  logo_url: null,
  branch_count: 0,
};

describe("Company headquarters", () => {
  it("lands on the overview with the company and an empty branch list", async () => {
    renderWithProviders(<DashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: hq,
      get: { "/company/me": { company } },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Bingo d.o.o." })).toBeInTheDocument();
    expect(screen.getByText(t("company.overview.noBranchesTitle"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("company.overview.editProfile") })).toHaveAttribute(
      "href",
      "/company/profile",
    );
  });

  it("edits the description with the name read-only", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Company profile updated.", company: { ...company, description: "Novi opis" } } });
    const success = vi.spyOn(toast, "success");
    renderWithProviders(<CompanyProfilePage />, {
      route: "/company/profile",
      path: "/company/profile",
      user: hq,
      get: { "/company/me": { company } },
    });

    expect(await screen.findByLabelText(t("company.profile.name"))).toBeDisabled();
    expect(screen.getByText(t("company.profile.nameNote"))).toBeInTheDocument();
    const description = screen.getByLabelText(t("company.profile.description"));
    await userEvent.clear(description);
    await userEvent.type(description, "Novi opis");
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    expect(apiMock.put).toHaveBeenCalledWith("/company/me", { description: "Novi opis" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Company profile updated."));
  });

  it("shows only the personal fields with the phone on My profile", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully.", user: hq } });
    renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user: hq });

    expect(await screen.findByText(t("user.companyRole"))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(t("user.phone"))).toHaveValue("035 000 111"));
    expect(screen.queryByLabelText(t("user.businessName"))).not.toBeInTheDocument();
    expect(screen.queryByText(t("credits.profile.title"))).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalledWith("/credits/plans");

    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    expect(apiMock.put).toHaveBeenCalledWith("/users/me", {
      first_name: "Selma",
      last_name: "Bingo",
      phone: "035 000 111",
    });
  });

  it("shows the Company HQ role in the header", async () => {
    renderWithProviders(
      <NotificationsProvider enabled={false}>
        <Header isSidebarOpen onToggleSidebar={() => {}} />
      </NotificationsProvider>,
      { route: "/dashboard", path: "/dashboard", user: hq },
    );
    expect(await screen.findByText(t("auth.companyRole"))).toBeInTheDocument();
  });
});
