import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import StoreCard from "./StoreCard.js";
import { makeUser, t } from "../../test/utils.js";
import { WEEKDAYS, type Schedule } from "../../utils/schedule.js";
import type { User } from "../../types/index.js";

const everyDay = (hours: Schedule["mon"]) => Object.fromEntries(WEEKDAYS.map((day) => [day, hours])) as Schedule;

const STORE = makeUser({
  id: 2,
  role: "STORE",
  business_name: "Market Centar",
  company_name: null,
  address: "Titova 1",
  phone: "033 111 222",
  description: "Svježe svaki dan",
  distance_km: 0.8,
  active_products: "9",
  max_discount: 56,
  opening_schedule: everyDay({ open: "00:00", close: "24:00" }),
});

const renderCard = (store: User = STORE, onToggle = vi.fn()) =>
  render(
    <MemoryRouter>
      <StoreCard store={store} isFavorite={false} onToggleFavorite={onToggle} />
    </MemoryRouter>,
  );

describe("StoreCard", () => {
  it("shows the distance, the offers, the biggest discount, the open state and the contacts", () => {
    renderCard();
    const card = screen.getByTestId("store-card");
    expect(within(card).getByTestId("store-card-distance")).toHaveTextContent("0,8 km");
    expect(within(card).getByText("9 aktivnih ponuda")).toBeInTheDocument();
    expect(within(card).getByTestId("store-card-discount")).toHaveTextContent("do −56%");
    expect(within(card).getByTestId("store-card-open")).toHaveTextContent("Otvoreno · do 24:00");
    expect(within(card).getByText("Titova 1")).toBeInTheDocument();
    expect(within(card).getByText("033 111 222")).toBeInTheDocument();
  });

  it("puts the chain chip under a branch's name and the independent chip under every other", () => {
    const { unmount } = renderCard({ ...STORE, business_name: "Bingo Visoko", company_name: "Bingo d.o.o." });
    expect(screen.getByTestId("store-kind")).toHaveTextContent(t("store.chainLabel", { company: "Bingo d.o.o." }));
    unmount();
    renderCard();
    expect(screen.getByTestId("store-kind")).toHaveTextContent(t("store.independent"));
  });

  it("hides the discount without offers", () => {
    renderCard({ ...STORE, active_products: "0", max_discount: 0 });
    expect(screen.getByText(t("store.noOffers"))).toBeInTheDocument();
    expect(screen.queryByTestId("store-card-discount")).not.toBeInTheDocument();
  });

  it("is one link to the store page, and the heart does not open it", async () => {
    const onToggle = vi.fn();
    renderCard(STORE, onToggle);
    expect(screen.getByRole("link", { name: "Market Centar" })).toHaveAttribute("href", "/stores/2");
    await userEvent.click(screen.getByRole("button", { name: t("store.addToFavorites") }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("store-card")).toBeInTheDocument();
  });

  it("shows the order pause", () => {
    renderCard({ ...STORE, orders_paused: true, orders_paused_until: null });
    expect(screen.getByText(/Narudžbe pauzirane/)).toBeInTheDocument();
  });
});
