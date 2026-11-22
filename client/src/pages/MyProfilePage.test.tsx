import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyProfilePage from "./MyProfilePage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { User } from "../types/index.js";

// My profile of a company headquarters login and an admin (restaurants and stores: see
// BusinessProfilePage.test.tsx).
const renderPage = (user: User) => renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user });

describe("MyProfilePage for a headquarters and an admin", () => {
  beforeEach(() => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
  });

  it("saves a headquarters login's name and required phone", async () => {
    renderPage(makeUser({ role: "COMPANY", company_id: 3, company_name: "Bingo d.o.o.", phone: "033 000 111" }));
    const phone = await screen.findByDisplayValue("033 000 111");
    expect(screen.getByText("Bingo d.o.o.")).toBeInTheDocument();
    await userEvent.clear(phone);
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    expect(await screen.findByText(t("common.fieldRequired"))).toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();

    await userEvent.type(phone, "033 222 333");
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/users/me", { first_name: "Amir", last_name: "Hodžić", phone: "033 222 333" }),
    );
  });

  it("saves only an admin's name, and has no business sections", async () => {
    renderPage(makeUser({ role: "ADMIN" }));
    await screen.findByDisplayValue("Amir");
    expect(screen.queryByLabelText(t("user.phone"))).not.toBeInTheDocument();
    expect(screen.queryByTestId("business-profile")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/users/me", { first_name: "Amir", last_name: "Hodžić" }));
  });

  it("gives a restaurant and a store the redesigned page", async () => {
    const { unmount } = renderPage(makeUser({ role: "RESTAURANT", business_name: "Bistro Most", phone: "061" }));
    expect(await screen.findByTestId("business-profile")).toBeInTheDocument();
    unmount();
    renderPage(makeUser({ role: "STORE", business_name: "Market", phone: "061" }));
    expect(await screen.findByTestId("business-profile")).toBeInTheDocument();
  });
});
