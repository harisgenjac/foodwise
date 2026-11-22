import { screen, within } from "@testing-library/react";
import TodayCards from "./TodayCards.js";
import { CreditsProvider } from "../../context/CreditsContext.js";
import { makeCreditSummary, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { CreditSummary, StoreHomeToday } from "../../types/index.js";

const TODAY: StoreHomeToday = {
  pending: 3,
  first_deadline: null,
  to_prepare: 5,
  first_ready_at: null,
  hand_over_courier: 1,
  hand_over_pickup: 1,
  expiring_today: 4,
};

const renderCards = (today: StoreHomeToday | null, credits: Partial<CreditSummary> = {}) =>
  renderWithProviders(
    <CreditsProvider enabled>
      <TodayCards today={today} />
    </CreditsProvider>,
    {
      user: makeUser({ role: "STORE" }),
      get: { "/credits/me": { credits: makeCreditSummary(credits) } },
    },
  );

const card = (testId: string) => within(screen.getByTestId(testId));
const lineOf = (testId: string) => card(testId).getByTestId("today-card-line").textContent;
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60000 + 20000).toISOString();

describe("TodayCards", () => {
  it("shows the title with today's date and five link cards with their numbers", async () => {
    renderCards({ ...TODAY, first_deadline: inMinutes(8), first_ready_at: "2026-11-20T12:00:00" });

    expect(screen.getByRole("heading", { level: 2, name: "Danas" })).toBeInTheDocument();
    expect(screen.getByTestId("today-pending")).toHaveAttribute("href", "/orders?status=Pending");
    expect(card("today-pending").getByText("3")).toBeInTheDocument();
    expect(lineOf("today-pending")).toBe("Prva ističe za 9 min");
    // Something waits for the store: the card is orange.
    expect(screen.getByTestId("today-pending")).toHaveClass("border-accent-300");

    expect(screen.getByTestId("today-prepare")).toHaveAttribute("href", "/packing");
    expect(lineOf("today-prepare")).toBe("Prva do 12:00");
    expect(screen.getByTestId("today-hand-over")).toHaveAttribute("href", "/pickups");
    expect(card("today-hand-over").getByText("2")).toBeInTheDocument();
    expect(lineOf("today-hand-over")).toBe("1 kurir · 1 lično preuzimanje");
    expect(screen.getByTestId("today-expiring")).toHaveAttribute("href", "/my-products?expiry=0");
    expect(lineOf("today-expiring")).toBe("proizvoda u vašoj ponudi");
  });

  it("uses Bosnian plurals and leaves out an empty handover method", () => {
    renderCards({ ...TODAY, hand_over_courier: 0, hand_over_pickup: 3, expiring_today: 1 });
    expect(lineOf("today-hand-over")).toBe("3 lična preuzimanja");
    expect(lineOf("today-expiring")).toBe("proizvod u vašoj ponudi");
  });

  it("shows a later deadline as a time, and quiet cards when nothing waits", () => {
    const { unmount } = renderCards({ ...TODAY, first_deadline: inMinutes(120) });
    expect(lineOf("today-pending")).toMatch(/^Prva ističe u \d{2}:\d{2}$/);
    unmount();

    renderCards({ ...TODAY, pending: 0, to_prepare: 0, hand_over_courier: 0, hand_over_pickup: 0 });
    expect(lineOf("today-pending")).toBe(t("storeHome.today.pendingNone"));
    expect(screen.getByTestId("today-pending")).not.toHaveClass("border-accent-300");
    expect(lineOf("today-prepare")).toBe(t("storeHome.today.prepareNone"));
    expect(lineOf("today-hand-over")).toBe(t("storeHome.today.handOverNone"));
  });

  it("shows the month's credits with a bar coloured like the Credits page", async () => {
    const { unmount } = renderCards(TODAY, { hasActiveSubscription: true, total: 50, used: 16, available: 34 });
    expect(await card("today-credits").findByText("34")).toBeInTheDocument();
    expect(card("today-credits").getByText("/ 50")).toBeInTheDocument();
    expect(lineOf("today-credits")).toBe("Ovaj mjesec · dovoljno za 34 objave");
    expect(screen.getByTestId("today-credits")).toHaveAttribute("href", "/credits");
    expect(screen.getByTestId("today-credits-bar")).toHaveClass("bg-success-600");
    unmount();

    const almost = renderCards(TODAY, { hasActiveSubscription: true, total: 50, used: 40, available: 10 });
    expect(await screen.findByTestId("today-credits-bar")).toHaveClass("bg-warning-500");
    almost.unmount();

    renderCards(TODAY, { hasActiveSubscription: true, total: 50, used: 46, available: 4 });
    expect(await screen.findByTestId("today-credits-bar")).toHaveClass("bg-danger-500");
  });

  it("links to the subscription section without a plan", async () => {
    renderCards(TODAY, { hasActiveSubscription: false, total: 0, used: 0, available: 0 });
    expect(await card("today-credits").findByText("Nema pretplate")).toBeInTheDocument();
    expect(screen.getByTestId("today-credits")).toHaveAttribute("href", "/my-profile#subscription");
    expect(screen.queryByTestId("today-credits-bar")).not.toBeInTheDocument();
  });

  it("shows pulse cards while loading", () => {
    renderCards(null);
    expect(screen.getByTestId("store-today").querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByTestId("today-pending")).not.toBeInTheDocument();
  });
});
