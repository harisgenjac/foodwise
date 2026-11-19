import { act, render, screen, within } from "@testing-library/react";
import HowItWorks from "./HowItWorks.js";
import i18n from "../../i18n/config.js";

const STEPS = {
  bs: {
    title: "Kako funkcioniše",
    steps: [
      ["Pronađite ponudu", "po nižoj cijeni", "Pretražite hranu kojoj uskoro ističe rok i u korpu dodajte ono što vam treba iz jedne prodavnice, po nižoj cijeni."],
      ["Izaberite preuzimanje", "lično u prodavnici ili je primite dostavom", "Pokupite narudžbu lično u prodavnici ili je primite dostavom na adresu vašeg restorana."],
      ["Kuhajte već danas", "spremna za vašu kuhinju", "Prodavnica potvrdi narudžbu, a hrana stiže spremna za vašu kuhinju, umjesto da završi u smeću."],
    ],
  },
  en: {
    title: "How it works",
    steps: [
      ["Find an offer", "at a lower price", "Search for food close to its expiry date and add what you need from one store to your cart, at a lower price."],
      ["Choose how you get it", "in person at the store or get it delivered", "Pick up your order in person at the store or get it delivered to your restaurant's address."],
      ["Cook it today", "ready for your kitchen", "The store confirms your order, and the food arrives ready for your kitchen instead of ending up in the bin."],
    ],
  },
};

describe("HowItWorks", () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage("bs"));
  });

  it.each(["bs", "en"] as const)("shows the three numbered steps with their highlighted phrase (%s)", async (language) => {
    await act(() => i18n.changeLanguage(language));
    render(<HowItWorks />);

    const { title, steps } = STEPS[language];
    const section = screen.getByRole("region", { name: title });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    items.forEach((item, index) => {
      const [stepTitle, highlight, text] = steps[index]!;
      expect(within(item).getByRole("heading", { level: 3, name: stepTitle })).toBeInTheDocument();
      // One whole sentence, with only the key phrase in the highlight pill.
      expect(within(item).getByText((_, element) => element?.tagName === "P" && element.textContent === text)).toBeInTheDocument();
      const pill = within(item).getByTestId("how-it-works-highlight");
      expect(pill.textContent).toBe(highlight);
      expect(pill).toHaveClass("rounded-full", "bg-accent-200");
      // The illustration and the number are decorative.
      expect(item.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(within(item).getByText(String(index + 1))).toHaveAttribute("aria-hidden", "true");
    });
  });
});
