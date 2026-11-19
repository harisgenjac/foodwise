import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

// The restaurant's home page: the hero animation, the impact strip, the intro with the two main
// links and the store carousel (the phone layout is checked in mobile-layout.spec.ts).
test("the restaurant dashboard shows the wide hero, the intro with its two links and the stores, without the orders section", async ({ page }) => {
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
  // The intro: the brand is the page's h1, and the two links sit side by side, centred, 44 px
  // high and sized to their text (not full width).
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Još vrijedi");
  await expect(main.getByText(/^Hrana kojoj uskoro ističe rok još uvijek vrijedi\./)).toBeVisible();
  // Measure once the strip has loaded: its "Together we have saved" line moves the content down.
  await expect(page.getByTestId("impact-strip")).toHaveAttribute("aria-busy", "false");
  const search = (await main.getByRole("link", { name: "Pretraži proizvode" }).boundingBox())!;
  const orders = (await main.getByRole("link", { name: /^Moje narudžbe/ }).boundingBox())!;
  expect(Math.round(search.y)).toBe(Math.round(orders.y));
  expect(Math.round(search.height)).toBe(44);
  expect(Math.round(orders.height)).toBe(44);
  expect(search.width + orders.width).toBeLessThan(box.width / 2);
  const intro = (await main.getByTestId("restaurant-intro").boundingBox())!;
  expect(Math.abs((search.x + orders.x + orders.width) / 2 - (intro.x + intro.width / 2))).toBeLessThan(2);
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

test("the store carousel lists the nearest stores, a card opens its store, and the header link opens all stores", async ({ page }) => {
  await open(page, "/dashboard");
  const carousel = page.getByRole("region", { name: "Prodavnice u blizini" });
  await expect(carousel.getByText("Najbliže prve")).toBeVisible();
  const cards = carousel.getByTestId("store-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(20);
  // Nearest first: the distances ("Sarajevo · 16 km") never go down.
  const distances = (await cards.allTextContents()).map((text) => Number(text.match(/· ([\d.]+) km/)?.[1]?.replace(".", "")));
  expect(distances.every((km) => Number.isFinite(km))).toBe(true);
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  // Every card is a store: the old "All stores" card at the end is gone.
  expect(await carousel.getByRole("listitem").count()).toBe(await cards.count());

  // The previous arrow waits until the track has moved; next scrolls it.
  const previous = carousel.getByRole("button", { name: "Prethodne prodavnice" });
  const next = carousel.getByRole("button", { name: "Sljedeće prodavnice" });
  await expect(previous).toBeHidden();
  if (await next.isVisible()) {
    await next.click();
    await expect(previous).toBeVisible();
  }

  const first = cards.first();
  const name = (await first.getByTestId("store-card-name").textContent())!;
  const href = (await first.getAttribute("href"))!;
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await open(page, "/dashboard");
  await page.getByRole("region", { name: "Prodavnice u blizini" }).getByRole("link", { name: "Sve prodavnice" }).click();
  await expect(page).toHaveURL(/\/stores$/);
});

test("dragging the store carousel with the mouse scrolls it without opening a store", async ({ page }) => {
  // A narrow desktop (md, with the sidebar), so the e2e seed's few stores overflow the track.
  await page.setViewportSize({ width: 800, height: 900 });
  await open(page, "/dashboard");
  const carousel = page.getByRole("region", { name: "Prodavnice u blizini" });
  const track = carousel.getByTestId("store-carousel-track");
  const card = carousel.getByTestId("store-card").nth(1);
  await expect(card).toBeVisible();
  test.skip((await track.evaluate((el) => el.scrollWidth - el.clientWidth)) < 150, "Too few stores to scroll");

  // The mouse works in window coordinates: bring the track on screen first.
  await track.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + box.width / 2 - step * 20, y);
  await expect(track).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();

  // Still on the dashboard, the track moved and settles on a card edge.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(track).not.toHaveAttribute("data-dragging");
});

test("How it works comes after the store carousel, with three steps side by side", async ({ page }) => {
  await open(page, "/dashboard");
  const section = page.getByRole("region", { name: "Kako funkcioniše" });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  const steps = section.getByRole("listitem");
  await expect(steps).toHaveCount(3);
  await expect(steps.getByRole("heading", { level: 3 })).toHaveText(["Pronađite ponudu", "Izaberite preuzimanje", "Kuhajte već danas"]);
  await expect(section.getByTestId("how-it-works-highlight")).toHaveText([
    "po nižoj cijeni",
    "lično u prodavnici ili je primite dostavom",
    "spremna za vašu kuhinju",
  ]);
  // Below the carousel, and the three steps on one row.
  const carousel = (await page.getByTestId("store-carousel").boundingBox())!;
  const boxes = await Promise.all([0, 1, 2].map(async (index) => (await steps.nth(index).boundingBox())!));
  expect(boxes[0]!.y).toBeGreaterThan(carousel.y + carousel.height);
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width - 1);
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
