import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { acceptOrder, apiAs, cancelOrder, createProduct, myId, sendOrder } from "../support/api.js";
import { isoDate } from "../support/dates.js";
import { emptyCart, open, openProfileSection, saveProfile } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

// The weekdays as My profile and the week popover name them.
const DAYS = [
  { key: "mon", short: "Mon", name: "Ponedjeljak" },
  { key: "tue", short: "Tue", name: "Utorak" },
  { key: "wed", short: "Wed", name: "Srijeda" },
  { key: "thu", short: "Thu", name: "Četvrtak" },
  { key: "fri", short: "Fri", name: "Petak" },
  { key: "sat", short: "Sat", name: "Subota" },
  { key: "sun", short: "Sun", name: "Nedjelja" },
];

// No horizontal scroll: the page is never wider than the screen (the iPhone project checks 390 px;
// mobile-layout.spec.ts checks both pages at 375 px).
const expectNoSideScroll = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

// Runs on desktop Chrome and on the iPhone project.
test("a restaurant filters the stores, opens one, adds a product with + and the stepper, and goes to the cart", async ({ page }) => {
  const prefix = uniqueName("E2E Stranica");
  const soonName = `${prefix} Jogurt`;
  const laterName = `${prefix} Hljeb`;
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: soonName, category: "Dairy", unit: "kom", quantity: 5, expiry_date: isoDate(1) });
  await createProduct(storeApi, { name: laterName, category: "Bakery", unit: "kom", quantity: 5, expiry_date: isoDate(4) });
  await storeApi.dispose();
  await emptyCart(page);

  await test.step("Prodavnice: pretraga, filter udaljenosti i kartica", async () => {
    await open(page, "/stores");
    await expect(page.getByTestId("active-filter").filter({ hasText: "Do 10 km" })).toBeVisible();
    await page.getByPlaceholder("Pretraga po nazivu prodavnice").fill(ACCOUNTS.store.businessName);
    await page.getByRole("button", { name: /^Filteri/ }).click();
    const drawer = page.getByRole("dialog", { name: "Filteri" });
    await drawer.getByRole("button", { name: "Bez ograničenja" }).click();
    await drawer.getByRole("button", { name: "Zatvori", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("active-filter")).toHaveCount(0);
    const card = page.getByTestId("store-card").filter({ hasText: ACCOUNTS.store.businessName });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("store-kind")).toBeVisible();
    await expectNoSideScroll(page);
    await card.getByRole("link", { name: ACCOUNTS.store.businessName }).click();
  });

  await test.step("Zaglavlje: otvoreno, današnje vrijeme preuzimanja", async () => {
    await expect(page.getByRole("heading", { level: 1, name: ACCOUNTS.store.businessName })).toBeVisible();
    // The e2e store is open all day and picks up 10:00–18:00 every day (support/seed.ts).
    await expect(page.getByTestId("store-open-state")).toHaveText("Otvoreno · do 24:00");
    await expect(page.getByTestId("info-pickup")).toContainText("10:00 – 18:00");
    await expectNoSideScroll(page);
  });

  await test.step("Ističe uskoro i redovi po kategoriji; pretraga prelazi na mrežu", async () => {
    await expect(page.getByRole("region", { name: "Ističe uskoro" }).getByText(soonName)).toBeVisible();
    await page.getByLabel("Pretraga u ovoj prodavnici").fill(prefix);
    await expect(page.getByTestId("product-grid").getByTestId("store-product-card")).toHaveCount(2);
  });

  await test.step("+ dodaje u korpu i postaje stepper", async () => {
    const card = page.getByTestId("store-product-card").filter({ hasText: soonName });
    await card.getByRole("button", { name: `Dodaj u korpu: ${soonName}` }).click();
    const quantity = card.getByLabel(`Količina u korpi: ${soonName} (kom)`);
    await expect(quantity).toHaveValue("1");
    await card.getByRole("button", { name: `Povećaj količinu: ${soonName}` }).click();
    await expect(quantity).toHaveValue("2");
  });

  await test.step("Traka korpe vodi u korpu", async () => {
    const bar = page.getByTestId("store-cart-bar");
    await expect(bar).toContainText(`Korpa · ${ACCOUNTS.store.businessName}`);
    await expect(bar).toContainText("1 proizvod");
    await bar.getByRole("link", { name: "Idi na korpu" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line").filter({ hasText: soonName })).toBeVisible();
  });

  await test.step("Traka korpe prazni korpu nakon potvrde", async () => {
    await page.goBack();
    const bar = page.getByTestId("store-cart-bar");
    await bar.getByRole("button", { name: "Isprazni korpu" }).click();
    const dialog = page.getByRole("dialog", { name: "Isprazniti korpu?" });
    await dialog.getByRole("button", { name: "Isprazni korpu" }).click();
    await expect(bar).toBeHidden();
    await expect(page.getByTestId("store-product-card").filter({ hasText: soonName }).getByRole("button", { name: `Dodaj u korpu: ${soonName}` }).first()).toBeVisible();
  });
});

test("the My orders tab lists the restaurant's orders at the store with their statuses", async ({ page }) => {
  const prefix = uniqueName("E2E Moje");
  const storeApi = await apiAs("store");
  const restaurantApi = await apiAs("restaurant");
  const storeId = await myId(storeApi);
  const [pending, accepted, cancelled] = await Promise.all(
    ["Čeka", "Prihvaćeno", "Otkazano"].map((name) => createProduct(storeApi, { name: `${prefix} ${name}` })),
  );
  const pendingOrder = await sendOrder(restaurantApi, pending!.id, 1);
  const acceptedOrder = await sendOrder(restaurantApi, accepted!.id, 1);
  await acceptOrder(storeApi, acceptedOrder.id);
  const cancelledOrder = await sendOrder(restaurantApi, cancelled!.id, 1);
  await cancelOrder(restaurantApi, cancelledOrder.id);

  await open(page, `/stores/${storeId}`);
  await page.getByRole("tab", { name: /Moje narudžbe/ }).click();
  const panel = page.getByRole("tabpanel", { name: /Moje narudžbe/ });
  // A table row on desktop, a card on phones (found by its code).
  const order = ({ id, code }: { id: number; code: string }) =>
    panel.locator(`[data-testid="store-order-${id}"], [data-testid="data-card"]:has-text("#${code}")`).filter({ visible: true });
  await expect(order(cancelledOrder).getByTestId("order-status")).toHaveText("Otkazano");
  await expect(order(acceptedOrder).getByTestId("order-status")).toHaveText("Potvrđeno");
  await expect(order(pendingOrder).getByTestId("order-status")).toHaveText("Na čekanju");
  await expect(order(pendingOrder)).toContainText(`#${pendingOrder.code}`);
  await expect(order(pendingOrder)).toContainText(`${prefix} Čeka`);
  await expectNoSideScroll(page);

  // The shared restaurant may have at most 10 Pending orders.
  await cancelOrder(restaurantApi, pendingOrder.id);
  await Promise.all([storeApi.dispose(), restaurantApi.dispose()]);
});

test.describe("the store's own side", () => {
  test.use({ storageState: storageState("store") });

  test("a store sets its weekly pickup hours on My profile", async ({ page, browser }) => {
    const storeApi = await apiAs("store");
    // The profile as the seed made it, to put back exactly at the end.
    const { user: before } = await (await storeApi.get("/api/users/me")).json();
    // A day two days from today: the other specs (on both projects, at the same time) read today's
    // pickup hours, and must still see them.
    const today = DAYS.findIndex((day) => day.short === new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Sarajevo" }).format(new Date()));
    const closed = DAYS[(today + 2) % 7]!;
    const openDay = DAYS[(today + 3) % 7]!;
    try {
      await open(page, "/my-profile");
      await openProfileSection(page, /Radno vrijeme i preuzimanje/);
      const pickup = page.getByRole("group", { name: "Vrijeme preuzimanja" });
      await pickup.getByRole("switch", { name: `Otvoreno: ${closed.name}` }).click();
      await expect(pickup.getByTestId(`hours-row-${closed.key}`).getByText("Zatvoreno")).toBeVisible();
      await saveProfile(page);

      const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
      const restaurant = await restaurantContext.newPage();
      await open(restaurant, `/stores/${await myId(storeApi)}`);
      await restaurant.getByRole("button", { name: "Preuzimanje: cijela sedmica" }).click();
      const week = restaurant.getByRole("dialog", { name: "Preuzimanje" });
      const day = (name: string) => week.getByRole("listitem").filter({ hasText: new RegExp(`^${name}`) });
      await expect(day(closed.name)).toContainText("Zatvoreno");
      await expect(day(openDay.name)).toContainText("10:00 – 18:00");
      await restaurant.keyboard.press("Escape");
      await expect(week).toBeHidden();
      await restaurantContext.close();
    } finally {
      // Leave the shared store as the seed made it: its own pickup hours every day (ticking the
      // day again in the form would give it the default 08:00–20:00).
      const restored = await storeApi.put("/api/users/me", {
        data: {
          first_name: before.first_name,
          last_name: before.last_name,
          business_name: before.business_name,
          city_id: before.city_id,
          address: before.address,
          phone: before.phone,
          pickup_schedule: before.pickup_schedule,
        },
      });
      expect(restored.ok()).toBe(true);
      await storeApi.dispose();
    }
  });
});
