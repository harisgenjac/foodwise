import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import Header from "./Header.js";
import { NotificationsProvider } from "../context/NotificationsContext.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";

const user = makeUser({ role: "STORE" });

const renderHeader = () =>
  renderWithProviders(
    <NotificationsProvider enabled={false}>
      <Header isSidebarOpen onToggleSidebar={() => {}} />
    </NotificationsProvider>,
    { route: "/dashboard", path: "/dashboard", user },
  );

const logOut = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /Amir Hodžić/ }));
  await userEvent.click(screen.getByRole("button", { name: t("header.logout") }));
};

describe("Header logout", () => {
  it("goes to the login page without a toast", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Logged out." } });
    const success = vi.spyOn(toast, "success");
    renderHeader();

    await logOut();
    expect(apiMock.post).toHaveBeenCalledWith("/auth/logout");
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
    expect(success).not.toHaveBeenCalled();
  });

  it("says so and stays when logging out fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(500));
    const errorToast = vi.spyOn(toast, "error");
    renderHeader();

    await logOut();
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(t("header.logoutError")));
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});

describe("Header for a branch", () => {
  it("shows the branch and its company instead of the role", async () => {
    renderWithProviders(
      <NotificationsProvider enabled={false}>
        <Header isSidebarOpen onToggleSidebar={() => {}} />
      </NotificationsProvider>,
      {
        route: "/dashboard",
        path: "/dashboard",
        user: makeUser({ role: "STORE", business_name: "Bingo Visoko", company_id: 3, company_name: "Bingo d.o.o." }),
      },
    );
    expect(
      await screen.findByText(t("header.branchOf", { branch: "Bingo Visoko", company: "Bingo d.o.o." })),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("auth.storeRole"))).not.toBeInTheDocument();
  });
});
