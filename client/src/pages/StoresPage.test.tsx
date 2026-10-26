import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import StoresPage from "./StoresPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { User } from "../types/index.js";

const store = (id: number, business_name: string): User =>
  makeUser({ id, role: "STORE", business_name, city: "Sarajevo", active_products: "2" } as Partial<User>);

describe("StoresPage", () => {
  it("asks the server for favorite stores only while the toggle is on", async () => {
    renderWithProviders(<StoresPage />, {
      route: "/stores",
      path: "/stores",
      user: makeUser(),
      get: {
        "/favorites": { favorites: [{ id: 2 }] },
        "/users/stores": (params: { favorites: string }) => ({
          stores: params.favorites === "true" ? [store(2, "Omiljena")] : [store(1, "Prva"), store(2, "Omiljena")],
        }),
      },
    });

    expect(await screen.findByText("Prva")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t("store.onlyFavorites")) }));

    expect(await screen.findByText(t("store.count", { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByText("Prva")).not.toBeInTheDocument();
    expect(screen.getByText("Omiljena")).toBeInTheDocument();
    const lastParams = apiMock.get.mock.calls.filter(([url]) => url === "/users/stores").at(-1)?.[1]?.params;
    expect(lastParams).toMatchObject({ favorites: "true" });
  });

  // The favorites the server knows; adding one changes what /favorites returns next.
  const renderWithFavorites = (favorites: number[]) =>
    renderWithProviders(<StoresPage />, {
      route: "/stores",
      path: "/stores",
      user: makeUser(),
      get: {
        "/favorites": () => ({ favorites: favorites.map((id) => ({ id })) }),
        "/users/stores": { stores: [store(1, "Prva")] },
      },
    });

  it("fills the heart without a toast when a store is added to favorites", async () => {
    const favorites: number[] = [];
    apiMock.post.mockImplementation(async () => {
      favorites.push(1);
      return { data: {} };
    });
    const success = vi.spyOn(toast, "success");
    renderWithFavorites(favorites);

    await userEvent.click(await screen.findByRole("button", { name: t("store.addToFavorites") }));
    expect(apiMock.post).toHaveBeenCalledWith("/favorites", { store_id: 1 });
    expect(await screen.findByRole("button", { name: t("store.removeFromFavorites") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(success).not.toHaveBeenCalled();
  });

  it("shows the server's reason when adding a favorite fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(400, "Store is already in favorites."));
    const errorToast = vi.spyOn(toast, "error");
    renderWithFavorites([]);

    await userEvent.click(await screen.findByRole("button", { name: t("store.addToFavorites") }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Store is already in favorites."));
    expect(screen.getByRole("button", { name: t("store.addToFavorites") })).toHaveAttribute("aria-pressed", "false");
  });
});
