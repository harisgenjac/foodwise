import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

// The restaurant's home page: the hero animation, the impact strip, the two main links and the
// store carousel (the phone layout is checked in mobile-layout.spec.ts).
test("the restaurant dashboard shows the wide hero, the two links and the stores, without the orders section", async ({ page }) => {
  await open(page, "/dashboard");
  const hero = page.getByRole("img", { name: "Animacija Još vrijedi" });
  await expect(hero).toHaveCount(1);
  await expect(hero).toHaveAttribute("data-testid", "restaurant-hero-wide");
  await expect(hero.getByText("Bolje popust")).toBeAttached();
  // About 320 px at most, the full width of the content.
  const box = (await hero.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(322);
  expect(box.width).toBeGreaterThan(600);

  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Pretraži proizvode" })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Moje narudžbe/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Prodavnice u blizini" })).toBeVisible();
  // The orders section, the old hero's stat cards and its offers are gone.
  await expect(main.getByRole("heading", { name: "Moje narudžbe" })).toHaveCount(0);
  await expect(main.getByTestId("order-card")).toHaveCount(0);
  await expect(page.getByTestId("stat-label")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ponude koje uskoro ističu" })).toHaveCount(0);
});

test("the two links open Search and My orders", async ({ page }) => {
  await open(page, "/dashboard");
  await page.getByRole("main").getByRole("link", { name: "Pretraži proizvode" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pretraga" })).toBeVisible();

  await open(page, "/dashboard");
  await page.getByRole("main").getByRole("link", { name: /^Moje narudžbe/ }).click();
  await expect(page).toHaveURL(/\/my-orders$/);
  await expect(page.getByRole("heading", { level: 1, name: "Moje narudžbe" })).toBeVisible();
});

test("the store carousel lists the nearest stores, a card opens its store, and the last card opens all stores", async ({ page }) => {
  await open(page, "/dashboard");
  const carousel = page.getByRole("region", { name: "Prodavnice u blizini" });
  const cards = carousel.getByTestId("store-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(20);
  // Nearest first: the distances never go down.
  const distances = (await cards.allTextContents()).map((text) => Number(text.match(/(\d+) km$/)?.[1]));
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  await expect(carousel.getByRole("listitem").last()).toHaveText("Sve prodavnice");

  // The previous arrow waits until the track has moved; next scrolls it.
  const previous = carousel.getByRole("button", { name: "Prethodne prodavnice" });
  const next = carousel.getByRole("button", { name: "Sljedeće prodavnice" });
  await expect(previous).toBeHidden();
  if (await next.isVisible()) {
    await next.click();
    await expect(previous).toBeVisible();
  }

  const first = cards.first();
  const name = (await first.locator("div").first().textContent())!;
  const href = (await first.getAttribute("href"))!;
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await open(page, "/dashboard");
  await page.getByTestId("store-card-all").click();
  await expect(page).toHaveURL(/\/stores$/);
});

test("the impact strip under the hero shows three numbers and explains them on focus", async ({ page }) => {
  await open(page, "/dashboard");
  const strip = page.getByRole("region", { name: "Vaš uticaj" });
  await expect(strip.getByTestId("impact-value")).toHaveText([/^\d{1,3}(\.\d{3})*,\d kg$/, /^\d{1,3}(\.\d{3})*,\d kg$/, /^\d{1,3}(\.\d{3})*,\d{2} KM$/]);
  // Attached to the hero with no gap: the strip starts where the hero ends (overlapping it by 1 px).
  const hero = (await page.getByRole("img", { name: "Animacija Još vrijedi" }).boundingBox())!;
  const gap = (await strip.boundingBox())!.y - (hero.y + hero.height);
  expect(gap).toBeLessThanOrEqual(0);
  expect(gap).toBeGreaterThanOrEqual(-1.5);

  const tooltip = page.getByRole("tooltip").filter({ hasText: "Procjena: svaki spašeni kilogram" });
  await expect(tooltip).toBeHidden();
  await strip.getByRole("button", { name: "Kako se računa CO₂" }).focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Manje CO₂");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});
