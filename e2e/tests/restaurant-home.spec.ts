import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

// The restaurant's home page on desktop: the hero with its stats and the store slider (the phone
// layout is checked in mobile-layout.spec.ts).
test("the home page shows the hero with the stats and the store slider", async ({ page }) => {
  await open(page, "/dashboard");
  const main = page.getByRole("main");
  const hero = page.getByTestId("home-hero");

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Još vrijedi");
  await expect(hero.getByText(/^Kupujte hranu kojoj uskoro ističe rok/)).toBeVisible();
  await expect(hero.getByRole("img", { name: "Kuhar drži papirnu kesu punu povrća" })).toBeVisible();
  await expect(hero.getByRole("status")).toHaveText(/\S/);
  // The hero spans the content's width; the page uses Plus Jakarta Sans.
  const heroBox = (await hero.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(heroBox.width).toBeGreaterThan(mainBox.width - 60);
  expect(await hero.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Plus Jakarta Sans");

  // The restaurant's own stats, formatted for Bosnian, inside the hero.
  const stats = page.getByRole("group", { name: "Vaš uticaj" });
  await expect(stats.getByTestId("home-stat-value")).toHaveText([
    /^\d{1,3}(\.\d{3})*,\d kg$/,
    /^\d{1,3}(\.\d{3})*,\d kg$/,
    /^\d{1,3}(\.\d{3})*,\d{2} KM$/,
  ]);
  const tooltip = page.getByRole("tooltip").filter({ hasText: "Procjena: svaki spašeni kilogram" });
  await expect(tooltip).toBeHidden();
  await stats.getByRole("button", { name: "Kako se računa CO₂" }).focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();

  // The slider under the hero: at most 20 stores, every card a link to its store.
  const slider = page.getByRole("region", { name: "Prodavnice u blizini" });
  const cards = slider.getByTestId("store-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(20);
  expect((await slider.boundingBox())!.y).toBeGreaterThan(heroBox.y + heroBox.height - 1);
});

test("Shop now opens Search, and Track delivery only says it is coming soon", async ({ page }) => {
  await open(page, "/dashboard");
  await page.getByRole("button", { name: "Prati dostavu" }).click();
  await expect(page.getByText("Uskoro", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "Kupi sada" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pretraga" })).toBeVisible();
});

test("a store card opens its store, and the arrows scroll the slider", async ({ page }) => {
  await open(page, "/dashboard");
  const slider = page.getByRole("region", { name: "Prodavnice u blizini" });
  const previous = slider.getByRole("button", { name: "Prethodne prodavnice" });
  const next = slider.getByRole("button", { name: "Sljedeće prodavnice" });
  await expect(slider.getByTestId("store-card").first()).toBeVisible();
  await expect(previous).toBeHidden();
  if (await next.isVisible()) {
    await next.click();
    await expect(previous).toBeVisible();
    await previous.click();
    await expect(previous).toBeHidden();
  }

  const first = slider.getByTestId("store-card").first();
  const name = (await first.getByTestId("store-card-name").textContent())!;
  const href = (await first.getAttribute("href"))!;
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

test("dragging the store slider with the mouse scrolls it without opening a store", async ({ page }) => {
  // A narrow desktop (md, with the sidebar), so the e2e seed's few stores overflow the track.
  await page.setViewportSize({ width: 800, height: 900 });
  await open(page, "/dashboard");
  const slider = page.getByRole("region", { name: "Prodavnice u blizini" });
  const track = slider.getByTestId("store-slider-track");
  const card = slider.getByTestId("store-card").nth(1);
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
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  await expect(track).not.toHaveAttribute("data-dragging");
});

test("the header search opens Search with the text in its name filter", async ({ page }) => {
  await open(page, "/stores");
  const field = page.getByRole("searchbox", { name: "Pretraži proizvode ili prodavnice" });
  await field.fill("hljeb");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=hljeb$/);
  await expect(page.getByPlaceholder("Pretraga po imenu")).toHaveValue("hljeb");
});
