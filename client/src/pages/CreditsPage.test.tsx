import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreditsPage from "./CreditsPage.js";
import { CreditsProvider } from "../context/CreditsContext.js";
import { makeCreditSummary, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { CreditHistory, CreditSummary } from "../types/index.js";

const HISTORY: CreditHistory = {
  year: 2030,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2030-${String(index + 1).padStart(2, "0")}-01`,
    // A subscription in January only; the page's current month is January 2030.
    hasSubscription: index === 0,
    total: index === 0 ? 50 : 0,
    used: index === 0 ? 10 : 0,
  })),
  categories: [
    { category: "Fish", used: 6 },
    { category: "Meat", used: 4 },
  ],
};

const renderPage = (credits: CreditSummary) =>
  renderWithProviders(
    <CreditsProvider enabled>
      <CreditsPage />
    </CreditsProvider>,
    {
      route: "/credits",
      path: "/credits",
      user: makeUser({ role: "STORE" }),
      get: { "/credits/me": { credits }, "/credits/me/history": { history: HISTORY } },
    },
  );

describe("CreditsPage", () => {
  it("shows this month's numbers, a colored usage bar and when it was refreshed", async () => {
    renderPage(makeCreditSummary({ used: 45, available: 5 }));

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "90");
    expect(bar.firstElementChild).toHaveClass("bg-red-500");
    expect(screen.getByText(t("credits.page.usedPercent", { percent: 90 }))).toBeInTheDocument();
    expect(screen.getByText("01/01/2030 – 31/01/2030")).toBeInTheDocument();
    expect(screen.getByText(t("credits.page.explanationStore"))).toBeInTheDocument();
    expect(screen.getByText(t("credits.page.lastRefreshed", { time: "" }).trim(), { exact: false })).toBeInTheDocument();
  });

  it("uses green for low usage", async () => {
    renderPage(makeCreditSummary());
    expect((await screen.findByRole("progressbar")).firstElementChild).toHaveClass("bg-green-500");
  });

  it("shows months with used and unused credits, and grey months without a subscription or in the future", async () => {
    renderPage(makeCreditSummary());

    const january = await screen.findByTestId("month-bar-1");
    expect(january).toHaveClass("bg-blue-200");
    expect(january.firstElementChild).toHaveClass("bg-blue-800");
    expect(january.firstElementChild).toHaveStyle({ width: "20%" });
    expect(screen.getByText("10 / 50")).toBeInTheDocument();
    expect(screen.getByTestId("month-bar-2")).toHaveClass("bg-gray-200");
    expect(screen.getByTestId("month-bar-2")).toBeEmptyDOMElement();
  });

  it("shows each category's share of the year's used credits", async () => {
    renderPage(makeCreditSummary());

    await userEvent.click(await screen.findByRole("tab", { name: t("credits.page.byCategory") }));
    expect(screen.getByTestId("category-bar-Fish")).toHaveStyle({ width: "60%" });
    expect(screen.getByTestId("category-bar-Meat")).toHaveStyle({ width: "40%" });
    expect(screen.getByTestId("category-bar-Dairy")).toHaveStyle({ width: "0%" });
  });

  it("links to the subscription section without a subscription", async () => {
    renderPage(makeCreditSummary({ subscription: null, hasActiveSubscription: false, total: 0, used: 0, available: 0 }));
    expect(await screen.findByText(t("credits.page.noSubscription"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("credits.banner.noneLink") })).toHaveAttribute("href", "/my-profile#subscription");
  });
});
