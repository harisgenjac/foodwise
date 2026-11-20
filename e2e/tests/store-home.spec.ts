import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open } from "../support/ui.js";

test.use({ storageState: storageState("store") });

// The store's home page on desktop (design/store-home/store.dc.html): the hero with its stats, How it
// works and the donation band. Today, New orders and Expiring soon are not built yet.
test("the store home shows the hero with the store's stats, How it works and the donation band", async ({ page }) => {
  await open(page, "/dashboard");
  const main = page.getByRole("main");
  const hero = page.getByTestId("home-hero");

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Još vrijedi");
  await expect(hero.getByText(/^Prodajte hranu kojoj uskoro ističe rok/)).toBeVisible();
  await expect(hero.getByRole("img", { name: "Prodavač drži gajbu punu povrća" })).toBeVisible();
  await expect(hero.getByRole("status")).toHaveText(/\S/);
  // The hero spans the content's width; the page uses Plus Jakarta Sans.
  const heroBox = (await hero.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(heroBox.width).toBeGreaterThan(mainBox.width - 60);
  expect(await hero.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Plus Jakarta Sans");

  // The store's own stats, formatted for Bosnian: food saved, CO₂ and back in the till.
  const stats = page.getByRole("group", { name: "Vaš uticaj" });
  await expect(stats.getByTestId("home-stat-value")).toHaveText([
    /^\d{1,3}(\.\d{3})*,\d kg$/,
    /^\d{1,3}(\.\d{3})*,\d kg$/,
    /^\d{1,3}(\.\d{3})*,\d{2} KM$/,
  ]);
  const tooltip = page.getByRole("tooltip").filter({ hasText: "zbir svih preuzetih narudžbi" });
  await expect(tooltip).toBeHidden();
  await stats.getByRole("button", { name: "Kako se računa vraćeno u kasu" }).hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();

  const how = page.getByRole("region", { name: "Od police do restorana" });
  const band = page.getByRole("region", { name: "Svaki obrok vrijedi, pogotovo onaj podijeljen" });
  const footer = page.getByRole("contentinfo");
  let previousBottom = heroBox.y + heroBox.height;
  for (const section of [how, band, footer]) {
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    const box = (await section.boundingBox())!;
    const top = box.y + (await page.evaluate(() => window.scrollY));
    expect(top).toBeGreaterThan(previousBottom - 60); // the footer's arch overlaps the band
    previousBottom = top + box.height;
  }
  await expect(how.getByRole("listitem")).toHaveCount(3);
  await expect(how.getByRole("heading", { level: 3 })).toHaveText(["Objavite ponudu", "Potvrdite narudžbu", "Predajte robu"]);
  await expect(band.getByRole("link", { name: "Doniraj hranu" })).toHaveAttribute("href", "/donate-food");
  await expect(band.getByRole("link", { name: "Budi sponzor" })).toHaveAttribute("href", "/sponsor");
});

test("Add product opens the add product page, and Orders the store's orders", async ({ page }) => {
  await open(page, "/dashboard");
  await page.getByTestId("home-hero").getByRole("link", { name: "Dodaj proizvod" }).click();
  await expect(page).toHaveURL(/\/add-product$/);

  await open(page, "/dashboard");
  await page.getByTestId("home-hero").getByRole("link", { name: "Narudžbe" }).click();
  await expect(page).toHaveURL(/\/orders$/);
});

test("the sidebar follows the design, and the header search opens My products filtered by the text", async ({ page }) => {
  await open(page, "/dashboard");
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("link")).toHaveText([
    "Početna",
    "Moji proizvodi",
    /^Narudžbe(\d+)?$/,
    "Pakovanje",
    "Izvještaji",
    "Krediti",
    "Preuzimanja",
    "Dodaj Proizvod",
    "Moj profil",
    "Doniraj hranu",
    "Budi sponzor",
  ]);
  // A store has no cart.
  await expect(page.getByRole("link", { name: /korp/i })).toHaveCount(0);

  const field = page.getByRole("searchbox", { name: "Pretraži svoje proizvode" });
  await field.fill("sir");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/my-products\?q=sir$/);
  await expect(page.getByPlaceholder("Pretraga po imenu")).toHaveValue("sir");
  await expect(field).toHaveValue("");
});

test("the store home has no horizontal scroll at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/dashboard");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await expect(page.getByTestId("home-stat-value").first()).toHaveText(/\S/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
