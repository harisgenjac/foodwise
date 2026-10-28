import { screen, waitFor, within } from "@testing-library/react";
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

  it("filters by a city from the list, with all cities as the default", async () => {
    renderWithProviders(<StoresPage />, {
      route: "/stores",
      path: "/stores",
      user: makeUser(),
      get: {
        "/favorites": { favorites: [] },
        "/users/stores": (params: { city_id: string }) => ({
          stores: params.city_id === "2" ? [store(2, "Tuzlanski")] : [store(1, "Prva"), store(2, "Tuzlanski")],
        }),
      },
    });
    expect(await screen.findByText("Prva")).toBeInTheDocument();

    const city = screen.getByLabelText(t("cities.label"));
    expect(city).toHaveDisplayValue(t("cities.all"));
    await screen.findByRole("option", { name: "Tuzla" });
    expect(within(city).getAllByRole("option").map((option) => option.textContent)).toEqual([
      t("cities.all"),
      "Sarajevo",
      "Tuzla",
      "Zenica",
      "Žepče",
    ]);
    await userEvent.selectOptions(city, "Tuzla");
    await waitFor(() => expect(screen.queryByText("Prva")).not.toBeInTheDocument());
    expect(apiMock.get.mock.calls.filter(([url]) => url === "/users/stores").at(-1)?.[1]?.params).toMatchObject({
      city_id: "2",
    });

    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(await screen.findByText("Prva")).toBeInTheDocument();
    expect(city).toHaveDisplayValue(t("cities.all"));
  });

  describe("distance", () => {
    const renderNearby = (outside = 2) =>
      renderWithProviders(<StoresPage />, {
        route: "/stores",
        path: "/stores",
        user: makeUser(),
        get: {
          "/favorites": { favorites: [] },
          "/users/stores": (params: { radius: string; favorites: string }) => {
            const stores =
              params.radius === "5"
                ? []
                : [{ ...store(1, "Pekara Visoko"), city: "Visoko", distance_km: 0 } as User];
            if (params.radius === "20" || params.favorites === "true") {
              stores.push({ ...store(2, "Market Kakanj"), city: "Kakanj", distance_km: 16 } as User);
            }
            const hidden = params.radius === "10" && params.favorites !== "true" ? outside : 0;
            return { stores, total: stores.length, outside_radius_count: hidden };
          },
        },
      });
    const lastParams = () => apiMock.get.mock.calls.filter(([url]) => url === "/users/stores").at(-1)?.[1]?.params;

    it("asks for 10 km by default and shows the distance on each card", async () => {
      renderNearby();
      expect(await screen.findByText("Pekara Visoko")).toBeInTheDocument();
      expect(screen.getByLabelText(t("radius.label"))).toHaveDisplayValue("Do 10 km");
      expect(lastParams()).toMatchObject({ radius: "10" });
      expect(screen.getByText("Visoko · u vašem gradu")).toBeInTheDocument();
    });

    it("tells how many stores lie further away and widens the radius", async () => {
      renderNearby();
      expect(await screen.findByText("Još 2 prodavnice su dalje od 10 km.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Prikaži do 20 km" }));
      expect(await screen.findByText("Market Kakanj")).toBeInTheDocument();
      expect(screen.getByText("Kakanj · 16 km")).toBeInTheDocument();
      expect(screen.queryByText(/dalje od/)).not.toBeInTheDocument();
    });

    it("explains an empty result with the radius and offers the next step", async () => {
      renderNearby();
      await screen.findByText("Pekara Visoko");
      await userEvent.selectOptions(screen.getByLabelText(t("radius.label")), "Do 5 km");
      expect(await screen.findByText(t("radius.emptyStores", { radius: "5" }))).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Prikaži do 10 km" }));
      expect(await screen.findByText("Pekara Visoko")).toBeInTheDocument();
    });

    it("shows every favorite without the radius hint", async () => {
      renderNearby();
      await screen.findByText("Još 2 prodavnice su dalje od 10 km.");
      await userEvent.click(screen.getByRole("button", { name: new RegExp(t("store.onlyFavorites")) }));
      expect(await screen.findByText("Market Kakanj")).toBeInTheDocument();
      expect(screen.queryByText(/dalje od/)).not.toBeInTheDocument();
    });

    it("resets the radius to 10 km on clear", async () => {
      renderNearby();
      await screen.findByText("Pekara Visoko");
      await userEvent.selectOptions(screen.getByLabelText(t("radius.label")), "Do 20 km");
      await screen.findByText("Market Kakanj");
      await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
      expect(screen.getByLabelText(t("radius.label"))).toHaveDisplayValue("Do 10 km");
      await waitFor(() => expect(lastParams()).toMatchObject({ radius: "10" }));
    });
  });
});
