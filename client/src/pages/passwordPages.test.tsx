import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./ForgotPasswordPage.js";
import LoginPage from "./LoginPage.js";
import ResetPasswordPage from "./ResetPasswordPage.js";
import { apiMock, axiosError, renderWithProviders, t } from "../test/utils.js";

const SENT = "Ako postoji račun s ovim emailom, poslali smo link za novu lozinku.";
const INVALID = { error: "Ovaj link nije ispravan ili je istekao.", code: "INVALID_LINK" };

describe("LoginPage and forgotten passwords", () => {
  it("links to the forgot password page", async () => {
    renderWithProviders(<LoginPage />, { route: "/login", path: "/login" });
    expect(screen.getByRole("link", { name: t("auth.forgot.link") })).toHaveAttribute("href", "/forgot-password");
  });

  it("says the password was changed after a reset", () => {
    renderWithProviders(<LoginPage />, { route: "/login", path: "/login", state: { passwordReset: true } });
    expect(screen.getByRole("status")).toHaveTextContent(t("auth.reset.done"));
  });
});

describe("ForgotPasswordPage", () => {
  const renderPage = () => renderWithProviders(<ForgotPasswordPage />, { route: "/forgot-password", path: "/forgot-password" });

  it("asks for the email first", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t("auth.forgot.submit") }));
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t("auth.email"))).toHaveAccessibleDescription(t("common.fieldRequired"));
  });

  it("sends the email and shows the server's answer, whatever the account", async () => {
    apiMock.post.mockResolvedValue({ data: { message: SENT } });
    renderPage();
    await userEvent.type(screen.getByLabelText(t("auth.email")), "store@test.com");
    await userEvent.click(screen.getByRole("button", { name: t("auth.forgot.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "store@test.com" });
    expect(await screen.findByRole("status")).toHaveTextContent(SENT);
    expect(screen.queryByLabelText(t("auth.email"))).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("auth.forgot.backToLogin") })).toHaveAttribute("href", "/login");
  });

  it("shows the server's error for an invalid email", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Email nije ispravan."));
    renderPage();
    await userEvent.type(screen.getByLabelText(t("auth.email")), "x@y");
    await userEvent.click(screen.getByRole("button", { name: t("auth.forgot.submit") }));
    expect(await screen.findByText("Email nije ispravan.")).toBeInTheDocument();
  });
});

describe("ResetPasswordPage", () => {
  const renderPage = (route = "/reset-password?token=abc") =>
    renderWithProviders(<ResetPasswordPage />, { route, path: "/reset-password" });

  const fill = async (next: string, repeat: string) => {
    await userEvent.type(await screen.findByLabelText(t("user.newPassword")), next);
    await userEvent.type(screen.getByLabelText(t("user.repeatPassword")), repeat);
    await userEvent.click(screen.getByRole("button", { name: t("auth.reset.submit") }));
  };

  it("says a used or expired link no longer works and offers a new one", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, INVALID.error));
    renderPage();
    expect(await screen.findByRole("heading", { name: t("auth.reset.invalidTitle") })).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith("/auth/reset-password/check", { token: "abc" });
    expect(screen.getByRole("link", { name: t("auth.reset.newLink") })).toHaveAttribute("href", "/forgot-password");
  });

  it("does not ask the server without a token", async () => {
    renderPage("/reset-password");
    expect(await screen.findByRole("heading", { name: t("auth.reset.invalidTitle") })).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("asks for the same password twice", async () => {
    apiMock.post.mockResolvedValue({ data: { purpose: "PASSWORD_RESET" } });
    renderPage();
    await fill("nova-lozinka-1", "nova-lozinka-2");
    expect(screen.getByLabelText(t("user.repeatPassword"))).toHaveAccessibleDescription(t("user.passwordMismatch"));
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it("sets the password and sends the user to log in with a success message", async () => {
    apiMock.post.mockResolvedValue({ data: { purpose: "PASSWORD_RESET", message: "ok" } });
    renderPage();
    await fill("nova-lozinka-1", "nova-lozinka-1");
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/auth/reset-password", { token: "abc", password: "nova-lozinka-1" }),
    );
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
  });

  it("words an invitation for a first password and goes on to My profile, signed in", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { purpose: "INVITATION" } })
      .mockResolvedValueOnce({ data: { purpose: "INVITATION", message: "ok", user: { id: 3 } } });
    renderWithProviders(<ResetPasswordPage />, { route: "/set-password?token=abc", path: "/set-password" });
    expect(await screen.findByRole("heading", { name: t("auth.invite.title") })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(t("user.newPassword")), "moja-lozinka-1");
    await userEvent.type(screen.getByLabelText(t("user.repeatPassword")), "moja-lozinka-1");
    await userEvent.click(screen.getByRole("button", { name: t("auth.invite.submit") }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/my-profile");
  });

  it("words an expired invitation", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, INVALID.error));
    renderWithProviders(<ResetPasswordPage />, { route: "/set-password?token=abc", path: "/set-password" });
    expect(await screen.findByText(t("auth.invite.invalidText"))).toBeInTheDocument();
  });

  it("shows the password rule from the server and keeps the form", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { purpose: "PASSWORD_RESET" } })
      .mockRejectedValueOnce(axiosError(400, "Lozinka mora imati najmanje 8 znakova."));
    renderPage();
    await fill("kratka", "kratka");
    expect(await screen.findByText("Lozinka mora imati najmanje 8 znakova.")).toBeInTheDocument();
    expect(screen.getByLabelText(t("user.newPassword"))).toBeInTheDocument();
  });

  it("switches to the expired view when the link stopped working meanwhile", async () => {
    const error = axiosError(400, INVALID.error);
    (error.response!.data as Record<string, unknown>).code = INVALID.code;
    apiMock.post.mockResolvedValueOnce({ data: { purpose: "PASSWORD_RESET" } }).mockRejectedValueOnce(error);
    renderPage();
    await fill("nova-lozinka-1", "nova-lozinka-1");
    expect(await screen.findByRole("heading", { name: t("auth.reset.invalidTitle") })).toBeInTheDocument();
  });
});
