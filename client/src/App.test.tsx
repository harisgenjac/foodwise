import { render, waitFor } from "@testing-library/react";
import App from "./App.js";
import { AuthProvider } from "./context/AuthContext.js";
import { axiosError, mockGet } from "./test/utils.js";

// The whole app with its BrowserRouter, opened at a given address by a visitor who is not logged in.
const openAsVisitor = (path: string) => {
  window.history.replaceState(null, "", path);
  mockGet({ "/users/me": axiosError(401, "Niste prijavljeni.") });
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
};

describe("App routes", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("sends the bare address to the login page when nobody is logged in (it used to stay blank)", async () => {
    openAsVisitor("/");
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(document.querySelector("form")).toBeInTheDocument();
  });

  it("sends an unknown address to the login page as well", async () => {
    openAsVisitor("/nema-ove-stranice");
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
  });
});
