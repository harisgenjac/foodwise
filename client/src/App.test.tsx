import { render, screen, waitFor } from "@testing-library/react";
import App from "./App.js";
import { AuthProvider } from "./context/AuthContext.js";
import { axiosError, makeUser, mockGet, t } from "./test/utils.js";
import type { User } from "./types/index.js";

// The whole app with its BrowserRouter, opened at a given address.
const openApp = (path: string, user: User | null = null) => {
  window.history.replaceState(null, "", path);
  mockGet({ "/users/me": user ? { user } : axiosError(401, "Niste prijavljeni.") });
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
};

describe("App routes", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("sends the bare address to the login page when nobody is logged in (it used to stay blank)", async () => {
    openApp("/");
    // The URL changes before the login form has rendered, so wait for both.
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
      expect(document.querySelector("form")).toBeInTheDocument();
    });
  });

  it("shows a page-not-found page for an unknown address, with a link to the login page", async () => {
    openApp("/nema-ove-stranice");
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/nema-ove-stranice");
    expect(screen.getByRole("link", { name: t("notFound.toLogin") })).toHaveAttribute("href", "/login");
  });

  it("links a logged-in user to the dashboard from the page-not-found page", async () => {
    openApp("/nesto/drugo", makeUser({ role: "STORE", business_name: "Market" }));
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("notFound.toDashboard") })).toHaveAttribute("href", "/dashboard");
  });
});
