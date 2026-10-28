import { screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute.js";
import PublicRoute from "./PublicRoute.js";
import { makeUser, renderWithProviders } from "../test/utils.js";
import type { Role } from "../types/index.js";

describe("ProtectedRoute", () => {
  it("shows a spinner while the session is loading", () => {
    renderWithProviders(<ProtectedRoute>Secret</ProtectedRoute>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects a visitor to /login", async () => {
    renderWithProviders(<ProtectedRoute>Secret</ProtectedRoute>, { route: "/dashboard", path: "/dashboard" });
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("renders the page for a logged-in user", async () => {
    renderWithProviders(<ProtectedRoute>Secret</ProtectedRoute>, { user: makeUser() });
    expect(await screen.findByText("Secret")).toBeInTheDocument();
  });

  it("sends a user with another role to the dashboard", async () => {
    renderWithProviders(<ProtectedRoute role="ADMIN">Secret</ProtectedRoute>, { route: "/admin", path: "/admin", user: makeUser() });
    expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("accepts any of several roles", async () => {
    const guarded = <ProtectedRoute role={["STORE", "RESTAURANT"]}>Secret</ProtectedRoute>;
    renderWithProviders(guarded, { user: makeUser({ role: "STORE" }) });
    expect(await screen.findByText("Secret")).toBeInTheDocument();
  });

  it("keeps an admin out of pages for stores and restaurants", async () => {
    renderWithProviders(<ProtectedRoute role={["STORE", "RESTAURANT"]}>Secret</ProtectedRoute>, {
      route: "/pickups",
      path: "/pickups",
      user: makeUser({ role: "ADMIN" }),
    });
    expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("keeps a company headquarters out of store, restaurant and admin pages", async () => {
    const hq = makeUser({ role: "COMPANY", company_id: 3 });
    const guards: (Role | Role[])[] = [["STORE", "RESTAURANT"], "STORE", "RESTAURANT", "ADMIN"];
    for (const role of guards) {
      const { unmount } = renderWithProviders(<ProtectedRoute role={role}>Secret</ProtectedRoute>, {
        route: "/guarded",
        path: "/guarded",
        user: hq,
      });
      expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
      unmount();
    }
  });

  it("lets a company headquarters into its own pages", async () => {
    renderWithProviders(<ProtectedRoute role="COMPANY">Company profile</ProtectedRoute>, {
      route: "/company/profile",
      path: "/company/profile",
      user: makeUser({ role: "COMPANY", company_id: 3 }),
    });
    expect(await screen.findByText("Company profile")).toBeInTheDocument();
  });
});

describe("PublicRoute", () => {
  it("renders the page for a visitor", async () => {
    renderWithProviders(<PublicRoute>Login form</PublicRoute>, { route: "/login", path: "/login" });
    expect(await screen.findByText("Login form")).toBeInTheDocument();
  });

  it("sends a logged-in user to the dashboard", async () => {
    renderWithProviders(<PublicRoute>Login form</PublicRoute>, {
      route: "/login",
      path: "/login",
      user: makeUser(),
    });
    expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
  });
});
