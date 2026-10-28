import { screen } from "@testing-library/react";
import StoreCard from "./StoreCard.js";
import { makeUser, renderWithProviders, t } from "../../test/utils.js";

describe("StoreCard", () => {
  it("shows the chain label of a branch under its name", () => {
    const store = makeUser({ id: 21, role: "STORE", business_name: "Bingo Visoko", company_name: "Bingo d.o.o." });
    renderWithProviders(<StoreCard store={store} isFavorite={false} onToggleFavorite={() => {}} />);
    expect(screen.getByRole("heading", { name: "Bingo Visoko" })).toBeInTheDocument();
    expect(screen.getByText(t("store.chainLabel", { company: "Bingo d.o.o." }))).toBeInTheDocument();
  });

  it("has no chain label for an independent store", () => {
    const store = makeUser({ id: 2, role: "STORE", business_name: "Market Centar", company_name: null });
    renderWithProviders(<StoreCard store={store} isFavorite={false} onToggleFavorite={() => {}} />);
    expect(screen.queryByTitle(/Bingo/)).not.toBeInTheDocument();
    expect(document.querySelector(".bg-teal-50")).toBeNull();
  });
});
