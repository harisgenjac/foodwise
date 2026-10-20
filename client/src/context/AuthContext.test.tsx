import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { apiMock, axiosError, makeUser, mockGet } from "../test/utils.js";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthContext", () => {
  it("loads the current user on mount", async () => {
    const user = makeUser({ business_name: "Restoran Ukus" });
    mockGet({ "/users/me": { user } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(user);
  });

  it("has no user when the session is missing", async () => {
    mockGet({ "/users/me": axiosError(401) });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("logs in and then loads the full profile", async () => {
    const basic = makeUser();
    const full = makeUser({ business_name: "Restoran Ukus", city: "Sarajevo" });
    let loggedIn = false;
    apiMock.get.mockImplementation(async () => {
      if (!loggedIn) throw axiosError(401);
      return { data: { user: full } };
    });
    apiMock.post.mockImplementation(async () => {
      loggedIn = true;
      return { data: { user: basic } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.login("amir@test.com", "secret"));
    expect(apiMock.post).toHaveBeenCalledWith("/auth/login", { email: "amir@test.com", password: "secret" });
    expect(result.current.user).toEqual(full);
  });

  it("keeps the basic user when loading the profile after login fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const basic = makeUser();
    mockGet({ "/users/me": axiosError(500) });
    apiMock.post.mockResolvedValue({ data: { user: basic } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.login("amir@test.com", "secret"));

    expect(result.current.user).toEqual(basic);
    consoleError.mockRestore();
  });

  it("lets a failed login reject so the page can show the error", async () => {
    mockGet({ "/users/me": axiosError(401) });
    apiMock.post.mockRejectedValue(axiosError(400, "Pogrešan email ili lozinka."));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.login("x@test.com", "bad")).rejects.toThrow();
    expect(result.current.user).toBeNull();
  });

  it("logs out", async () => {
    mockGet({ "/users/me": { user: makeUser() } });
    apiMock.post.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(() => result.current.logout());
    expect(apiMock.post).toHaveBeenCalledWith("/auth/logout");
    expect(result.current.user).toBeNull();
  });

  it("throws when used outside the provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth mora biti korišten unutar AuthProvider-a.");
    consoleError.mockRestore();
  });
});
