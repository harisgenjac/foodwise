import { render, screen, within } from "@testing-library/react";
import RestaurantHero from "./RestaurantHero.js";
import { t } from "../../test/utils.js";

describe("RestaurantHero", () => {
  it("has the wide and the phone layout, each one image with the title and description", () => {
    render(<RestaurantHero />);

    const images = screen.getAllByRole("img", { name: t("restaurantHero.title") });
    expect(images.map((image) => image.getAttribute("data-testid"))).toEqual([
      "restaurant-hero-wide",
      "restaurant-hero-phone",
    ]);
    for (const image of images) {
      expect(image).toHaveAccessibleDescription(t("restaurantHero.desc"));
      expect(image).toHaveAttribute("focusable", "false");
      expect(image).not.toHaveAttribute("tabindex");
    }
    // CSS shows one of them: the wide one from md up, the phone one below md.
    expect(images[0]).toHaveClass("hidden", "md:block");
    expect(images[1]).toHaveClass("block", "md:hidden");
  });

  it("draws every text from the translations in both layouts", () => {
    render(<RestaurantHero />);

    for (const image of screen.getAllByRole("img", { name: t("restaurantHero.title") })) {
      const scene = within(image);
      for (const key of [
        "store",
        "restaurant",
        "storeBubble1",
        "storeBubble2",
        "chefBubble1",
        "chefBubble2",
        "backpack1",
        "backpack2",
      ]) {
        expect(scene.getByText(t(`restaurantHero.${key}`)), key).toBeInTheDocument();
      }
    }
    expect(screen.getAllByText("Bolje popust")).toHaveLength(2);
    expect(screen.getAllByText("današnji meni!")).toHaveLength(2);
  });
});
