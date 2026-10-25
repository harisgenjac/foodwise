import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoresPage from "./StoresPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";
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
});
