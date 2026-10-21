import { screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute.js";
import PublicRoute from "./PublicRoute.js";
import { makeUser, renderWithProviders } from "../test/utils.js";

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
