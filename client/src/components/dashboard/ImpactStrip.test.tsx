import { act, render, screen, within } from "@testing-library/react";
import ImpactStrip, { formatImpactNumber } from "./ImpactStrip.js";
import { t } from "../../test/utils.js";
import i18n from "../../i18n/config.js";

const values = () => screen.getAllByTestId("impact-value").map((node) => node.textContent);

describe("ImpactStrip", () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage("bs"));
  });

  it("formats the numbers for the interface language", async () => {
    expect(formatImpactNumber(1246.5, 2, "bs")).toBe("1.246,50");
    expect(formatImpactNumber(873.94, 1, "bs")).toBe("873,9");
    expect(formatImpactNumber(1246.5, 2, "en")).toBe("1,246.50");
    expect(formatImpactNumber(873.94, 1, "en")).toBe("873.9");
  });

  it("shows the restaurant's own food saved, CO₂ and savings with an info button each", () => {
    render(<ImpactStrip impact={{ scope: "own", food_kg: 873.94, co2_kg: 2184.85, savings: 1246.5 }} />);

    expect(values()).toEqual(["873,9 kg", "2.184,9 kg", "1.246,50 KM"]);
    expect(screen.queryByText(t("impactStrip.together"))).not.toBeInTheDocument();
    const strip = screen.getByRole("region", { name: t("impactStrip.label") });
    for (const key of ["foodSaved", "co2", "saved"]) {
      const button = within(strip).getByRole("button", { name: t(`impactStrip.${key}Info`) });
      expect(button).toHaveAccessibleDescription(`${t(`impactStrip.${key}`)} ${t(`impactStrip.${key}Tip`)}`);
    }
  });

  it("says the platform's totals are shared while the restaurant has picked up nothing", () => {
    render(<ImpactStrip impact={{ scope: "platform", food_kg: 12, co2_kg: 30, savings: 4 }} />);

    expect(screen.getByText("Zajedno smo spasili")).toBeInTheDocument();
    expect(values()).toEqual(["12,0 kg", "30,0 kg", "4,00 KM"]);
  });

  it("uses English number formats in English", async () => {
    await act(() => i18n.changeLanguage("en"));
    render(<ImpactStrip impact={{ scope: "own", food_kg: 1873.94, co2_kg: 4684.85, savings: 1246.5 }} />);

    expect(values()).toEqual(["1,873.9 kg", "4,684.9 kg", "1,246.50 KM"]);
  });

  it("keeps its three stats with placeholder numbers while loading", () => {
    render(<ImpactStrip impact={null} />);

    const strip = screen.getByRole("region", { name: t("impactStrip.label") });
    expect(strip).toHaveAttribute("aria-busy", "true");
    expect(values()).toEqual(["", "", ""]);
    expect(screen.getAllByTestId("impact-value").every((node) => node.querySelector(".animate-pulse"))).toBe(true);
  });
});
