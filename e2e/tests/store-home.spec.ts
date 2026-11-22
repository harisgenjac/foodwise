import { expect, test } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { open, toast } from "../support/ui.js";
import { apiAs, cancelOrder, createProduct, sendOrder } from "../support/api.js";
import { uniqueName } from "../support/accounts.js";
import { isoDate } from "../support/dates.js";

test.use({ storageState: storageState("store") });

// The orders these tests send. The seeded restaurant is shared and may have at most 10 orders
// waiting for an answer, so the ones still Pending are withdrawn after each test (an accepted one
// cannot be, and does not count).
const sentOrders: number[] = [];
test.afterEach(async () => {
  const restaurant = await apiAs("restaurant");
  for (const id of sentOrders.splice(0)) {
    await cancelOrder(restaurant, id).catch(() => undefined);
  }
  await restaurant.dispose();
});

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

test("Danas, New orders and Expiring soon follow the hero, before How it works", async ({ page }) => {
  // At least one waiting order and one product expiring soon.
  const store = await apiAs("store");
  const restaurant = await apiAs("restaurant");
  const product = await createProduct(store, { name: uniqueName("E2E Početna Sir"), expiry_date: isoDate(1) });
  sentOrders.push((await sendOrder(restaurant, product.id, 1)).id);
  await store.dispose();
  await restaurant.dispose();

  await open(page, "/dashboard");
  const today = page.getByTestId("store-today");
  await expect(today.getByRole("heading", { level: 2, name: "Danas" })).toBeVisible();
  for (const card of ["today-pending", "today-prepare", "today-hand-over", "today-expiring", "today-credits"]) {
    await expect(today.getByTestId(card)).toBeVisible();
  }
  await expect(today.getByTestId("today-pending")).toHaveAttribute("href", "/orders?status=Pending");

  const orders = page.getByRole("region", { name: "Nove narudžbe" });
  await expect(orders.getByTestId("store-home-order").first()).toBeVisible();
  expect(await orders.getByTestId("store-home-order").count()).toBeLessThanOrEqual(3);
  const products = page.getByRole("region", { name: "Ističe uskoro u vašoj ponudi" });
  await expect(products.getByTestId("store-home-product").first()).toBeVisible();
  expect(await products.getByTestId("store-home-product").count()).toBeLessThanOrEqual(4);

  // The buttons of every order card line up at the bottom.
  const tops = await orders.getByRole("button", { name: /^Prihvati narudžbu/ }).evaluateAll((buttons) =>
    buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);

  const how = page.getByRole("region", { name: "Od police do restorana" });
  const order = [page.getByTestId("home-hero"), today, orders, products, how];
  let previous = -Infinity;
  for (const section of order) {
    const box = (await section.boundingBox())!;
    expect(box.y).toBeGreaterThan(previous);
    previous = box.y;
  }
});

test("accepting an order from the home removes its card and lowers Awaiting reply", async ({ page }) => {
  const store = await apiAs("store");
  const restaurant = await apiAs("restaurant");
  const product = await createProduct(store, { name: uniqueName("E2E Početna Prihvati") });
  sentOrders.push((await sendOrder(restaurant, product.id, 1)).id);
  await store.dispose();
  await restaurant.dispose();

  await open(page, "/dashboard");
  const pending = page.getByTestId("today-pending");
  const card = page.getByTestId("store-home-order").first();
  await expect(card).toBeVisible();
  const before = Number(await pending.getByTestId("today-card-value").textContent());
  const accept = card.getByRole("button", { name: /^Prihvati narudžbu/ });
  const label = (await accept.getAttribute("aria-label"))!;
  const code = label.match(/#[A-Z0-9]{4}/)![0];

  await accept.click();
  const dialog = page.getByRole("dialog", { name: `Odluka o narudžbi ${code}` });
  // "Prihvati sve" when the restaurant takes only the whole order, otherwise the per-item decision.
  await dialog.getByRole("button", { name: "Prihvati sve" }).or(dialog.getByRole("button", { name: "Potvrdi odluku" })).click();
  // A delivery order also asks when the goods will be ready.
  const ready = dialog.getByTestId("ready-time");
  if (await ready.isVisible()) await ready.getByRole("button", { name: "30 minuta" }).click();
  await dialog.getByRole("button", { name: "Sačuvaj odluku" }).click();
  await expect(toast(page, "Odluka o narudžbi je sačuvana.")).toBeVisible();

  await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  await expect(pending.getByTestId("today-card-value")).toHaveText(String(before - 1));
});

test("a new price from the home shows on the product page", async ({ page }) => {
  const store = await apiAs("store");
  await createProduct(store, { name: uniqueName("E2E Početna Cijena"), expiry_date: isoDate(0), original_price: 9, discounted_price: 6 });
  await store.dispose();

  await open(page, "/dashboard");
  const card = page.getByTestId("store-home-product").first();
  await expect(card).toBeVisible();
  const name = (await card.getByRole("heading", { level: 4 }).textContent())!;
  const href = (await card.getByRole("link", { name }).getAttribute("href"))!;
  const price = Number((await card.getByTestId("offer-price").textContent())!.replace(/[^\d,]/g, "").replace(",", "."));
  const next = Math.max(0.01, Math.round((price - 0.1) * 100) / 100);
  const text = next.toFixed(2).replace(".", ",");

  await card.getByRole("textbox", { name: `Nova cijena za ${name}` }).fill(text);
  await expect(card.getByTestId("price-hint")).toContainText("Novi popust");
  await card.getByRole("button", { name: "Spremi" }).click();
  await expect(card.getByTestId("offer-price")).toHaveText(`${text} KM`);
  await expect(card.getByTestId("price-hint")).toHaveText("Cijena promijenjena");

  await open(page, href);
  // The product page writes the price its own way ("1.9 KM").
  await expect(page.getByText(new RegExp(`^${String(next).replace(".", "[.,]")}0? KM$`)).first()).toBeVisible();
});

// With its own order and product, so the cards are on the page.
test("the store home has no horizontal scroll at 375 px", async ({ page }) => {
  const store = await apiAs("store");
  const restaurant = await apiAs("restaurant");
  const product = await createProduct(store, { name: uniqueName("E2E Početna Telefon"), expiry_date: isoDate(1) });
  sentOrders.push((await sendOrder(restaurant, product.id, 1)).id);
  await store.dispose();
  await restaurant.dispose();

  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/dashboard");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await expect(page.getByTestId("home-stat-value").first()).toHaveText(/\S/);
  await expect(page.getByTestId("store-home-order").first()).toBeVisible();
  await expect(page.getByTestId("store-home-product").first()).toBeVisible();
  // The Danas cards stack in one column on a phone.
  const [first, second] = await page.getByTestId("store-today").getByRole("link").evaluateAll((links) =>
    links.slice(0, 2).map((link) => link.getBoundingClientRect().left),
  );
  expect(first).toBe(second);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

