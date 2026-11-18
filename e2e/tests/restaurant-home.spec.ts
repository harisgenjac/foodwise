import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

// The restaurant's home page: the hero animation and My orders (the phone layout is checked in
// mobile-layout.spec.ts).
test("the restaurant dashboard shows the wide hero and My orders", async ({ page }) => {
  await open(page, "/dashboard");
  const hero = page.getByRole("img", { name: "Animacija Još vrijedi" });
  await expect(hero).toHaveCount(1);
  await expect(hero).toHaveAttribute("data-testid", "restaurant-hero-wide");
  await expect(hero.getByText("Bolje popust")).toBeAttached();
  // About 320 px at most, the full width of the content.
  const box = (await hero.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(322);
  expect(box.width).toBeGreaterThan(600);

  await expect(page.getByRole("heading", { name: "Moje narudžbe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vidi sve narudžbe" })).toHaveAttribute("href", "/my-orders");
  // The old hero, stat cards and offers are gone.
  await expect(page.getByTestId("stat-label")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ponude koje uskoro ističu" })).toHaveCount(0);
});

test("the impact strip under the hero shows three numbers and explains them on focus", async ({ page }) => {
  await open(page, "/dashboard");
  const strip = page.getByRole("region", { name: "Vaš uticaj" });
  await expect(strip.getByTestId("impact-value")).toHaveText([/^\d{1,3}(\.\d{3})*,\d kg$/, /^\d{1,3}(\.\d{3})*,\d kg$/, /^\d{1,3}(\.\d{3})*,\d{2} KM$/]);
  // Attached to the hero: the strip starts where the hero ends.
  const hero = (await page.getByRole("img", { name: "Animacija Još vrijedi" }).boundingBox())!;
  expect(Math.round((await strip.boundingBox())!.y)).toBe(Math.round(hero.y + hero.height));

  const tooltip = page.getByRole("tooltip").filter({ hasText: "Procjena: svaki spašeni kilogram" });
  await expect(tooltip).toBeHidden();
  await strip.getByRole("button", { name: "Kako se računa CO₂" }).focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Manje CO₂");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});
