import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage.js";
import RegisterPage from "./RegisterPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";

describe("LoginPage", () => {
  const renderLogin = () => renderWithProviders(<LoginPage />, { route: "/login", path: "/login" });

  const submit = async (email: string, password: string) => {
    await userEvent.type(screen.getByLabelText(t("auth.email")), email);
    await userEvent.type(screen.getByLabelText(t("auth.password")), password);
    await userEvent.click(screen.getByRole("button", { name: t("auth.loginButton") }));
  };

  it("logs in and goes to the dashboard", async () => {
    apiMock.post.mockResolvedValue({ data: { user: makeUser() } });
    renderLogin();

    await submit("amir@test.com", "test12345");
    expect(apiMock.post).toHaveBeenCalledWith("/auth/login", { email: "amir@test.com", password: "test12345" });
    expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("shows an error for wrong credentials", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Incorrect email or password."));
    renderLogin();

    await submit("amir@test.com", "wrong");
    expect(await screen.findByText(t("auth.loginError"))).toBeInTheDocument();
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });

  it("shows the server's reason for a blocked account", async () => {
    apiMock.post.mockRejectedValue(axiosError(403, "Your account is blocked. Reason: Kršenje pravila"));
    renderLogin();

    await submit("amir@test.com", "test12345");
    expect(await screen.findByText("Your account is blocked. Reason: Kršenje pravila")).toBeInTheDocument();
  });

  it("does not offer registration, since an admin creates business accounts", () => {
    renderLogin();
    expect(screen.queryByRole("link", { name: t("auth.registerLink") })).not.toBeInTheDocument();
    expect(screen.getByText(t("auth.accountByAdmin"))).toBeInTheDocument();
    expect(screen.queryByText(t("auth.registrationClosed"))).not.toBeInTheDocument();
  });

  it("explains why /register sent the visitor here", () => {
    renderWithProviders(<LoginPage />, { route: "/login", path: "/login", state: { registrationClosed: true } });
    expect(screen.getByText(t("auth.registrationClosed"))).toBeInTheDocument();
  });
});

describe("RegisterPage", () => {
  const renderRegister = () => renderWithProviders(<RegisterPage />, { route: "/register", path: "/register" });

  const fill = async () => {
    await userEvent.click(screen.getByRole("button", { name: t("auth.restaurantRole") }));
    await userEvent.type(screen.getByLabelText(t("auth.firstName")), "Lejla");
    await userEvent.type(screen.getByLabelText(t("auth.lastName")), "Softić");
    await userEvent.type(screen.getByLabelText(t("auth.email")), "lejla@test.com");
    await userEvent.type(screen.getByLabelText(t("auth.password")), "test12345");
    await userEvent.click(screen.getByRole("button", { name: t("auth.registerButton") }));
  };

  it("registers with the chosen role and goes to login", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Registration successful." } });
    renderRegister();

    await fill();
    expect(apiMock.post).toHaveBeenCalledWith("/auth/register", {
      first_name: "Lejla",
      last_name: "Softić",
      email: "lejla@test.com",
      password: "test12345",
      role: "RESTAURANT",
    });
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
  });

  it("shows the server's reason when registration fails", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "A user with this email already exists."));
    renderRegister();

    await fill();
    await waitFor(() => expect(screen.getByText("A user with this email already exists.")).toBeInTheDocument());
  });

  it("falls back to a generic error when the server gives no reason", async () => {
    apiMock.post.mockRejectedValue(new Error("network"));
    renderRegister();

    await fill();
    await waitFor(() => expect(screen.getByText(t("auth.registrationError"))).toBeInTheDocument());
  });
});
