import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_URL, storageState, uniqueName } from "../support/accounts.js";
import {
  acceptOrder,
  apiAs,
  createProduct,
  createStoreWithoutPlan,
  sendDeliveryOrder,
  sendOrder,
  setPin,
} from "../support/api.js";
import { sarajevoMinutesNow } from "../support/dates.js";
import { shiftPickup } from "../support/db.js";
import { open, toast } from "../support/ui.js";

// The restaurant's My orders (design/my-orders/): a fresh restaurant (so its list holds only this
// test's orders) has a pending pickup, a pickup accepted for earlier today, one accepted for
// yesterday and an accepted delivery from the seeded store. It filters Active by Dostava, opens a
// step's info, cancels the pending order, then filters History by period and status and opens the
// order. A pickup from today past its time is not late, yesterday's is. Nothing scrolls sideways at
// 375 px. The open orders are cancelled by the admin afterwards and the store's pin is removed.

const VISOKO = { latitude: 43.9889, longitude: 18.1781 };
const orderIds: number[] = [];
let restaurantApi: APIRequestContext | null = null;

test.afterEach(async () => {
  const admin = await apiAs("admin");
  for (const id of orderIds.splice(0)) {
    const { order } = await (await admin.get(`/api/admin/orders/${id}`)).json();
    if (["Pending", "Confirmed", "InDelivery"].includes(order.status)) {
      const response = await admin.post(`/api/admin/orders/${id}/cancel`, { data: { reason: "E2E cleanup" } });
      expect(response.ok(), `cancel ${id} → ${response.status()}`).toBe(true);
    }
  }
  await admin.dispose();
  const store = await apiAs("store");
  await setPin(store, null);
  await store.dispose();
  await restaurantApi?.dispose();
  restaurantApi = null;
});

const expectNoSideScroll = async (page: Page, what: string) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, what).toBeLessThanOrEqual(innerWidth);
};

test("a restaurant follows, filters and cancels its orders on My orders", async ({ browser, isMobile }) => {
  test.skip(isMobile, "Desktop flow; the phone width is checked at the end");
  // Accepting the delivery needs a ready time today, a little ahead.
  test.skip(24 * 60 - sarajevoMinutesNow() < 45, "no ready time left today");

  const store = await apiAs("store");
  await setPin(store, VISOKO);
  const fresh = await createStoreWithoutPlan("RESTAURANT");
  restaurantApi = await request.newContext({ baseURL: API_URL, storageState: fresh.storageState });
  await setPin(restaurantApi, { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });

  const names = {
    pending: uniqueName("E2E Moje Šljive"),
    today: uniqueName("E2E Moje Jaja"),
    yesterday: uniqueName("E2E Moje Hljeb"),
    delivery: uniqueName("E2E Moje Grožđe"),
  };
  const orders: Record<keyof typeof names, { id: number; code: string }> = {} as never;
  for (const key of Object.keys(names) as (keyof typeof names)[]) {
    const product = await createProduct(store, { name: names[key], quantity: 10, unit: "kg" });
    orders[key] = key === "delivery" ? await sendDeliveryOrder(restaurantApi, product.id, 2) : await sendOrder(restaurantApi, product.id, 2);
    orderIds.push(orders[key].id);
  }
  await acceptOrder(store, orders.today.id);
  await acceptOrder(store, orders.yesterday.id);
  await acceptOrder(store, orders.delivery.id, new Date(Date.now() + 20 * 60_000));
  // sendOrder picks tomorrow at 12:00: today at 00:01 (passed, not late) and yesterday at 13:30.
  await shiftPickup(orders.today.id, "-1 day -11 hours -59 minutes");
  await shiftPickup(orders.yesterday.id, "-2 days +1 hour +30 minutes");
  await store.dispose();

  const context = await browser.newContext({ storageState: fresh.storageState });
  const page = await context.newPage();
  const card = (name: string) => page.getByTestId("my-order-card").filter({ hasText: name });
  await open(page, "/my-orders");
  await expect(page.getByRole("tab", { name: /Aktivne/ })).toHaveAttribute("aria-selected", "true");
  await expect(card(names.pending)).toBeVisible();

  await test.step("Kasni samo preuzimanje od jučer, ne ono od danas kojem je prošlo vrijeme", async () => {
    await expect(card(names.today).getByTestId("late-badge")).toHaveCount(0);
    await expect(card(names.today).getByTestId("order-when")).toHaveText("Danas · 00:01");
    await expect(card(names.yesterday).getByTestId("late-badge")).toHaveText("Kasni");
    await expect(card(names.yesterday).getByText("Kasni · bilo jučer u 13:30")).toBeVisible();
  });

  await test.step("Filter Dostava ostavlja samo dostavu; info koraka se otvara", async () => {
    await page.getByRole("button", { name: /Filteri/ }).click();
    const panel = page.getByRole("dialog", { name: "Filteri" });
    await panel.getByRole("group", { name: "Način" }).getByRole("button", { name: "Dostava" }).click();
    await panel.getByRole("button", { name: "Zatvori", exact: true }).click();
    await expect(page.getByTestId("active-filter")).toHaveText(["Dostava"]);
    await expect(page.getByTestId("my-order-card")).toHaveCount(1);

    const steps = card(names.delivery).getByRole("list", { name: `Tok narudžbe #${orders.delivery.code}` });
    await expect(steps.getByTestId("order-step")).toHaveCount(5);
    await expect(steps.getByText("Čeka kurira")).toBeVisible();
    const accepted = steps.getByRole("button", { name: /Prihvaćeno/ });
    // Over the line nothing opens; over the dot the info does.
    await accepted.getByTestId("step-line").hover();
    await expect(steps.getByRole("tooltip")).toHaveCount(0);
    await accepted.getByTestId("step-marker").hover();
    const tip = steps.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Spremno za kurira u");
    await expect(tip).toContainText("gotovinom");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Očisti", exact: true }).click();
    await expect(page.getByTestId("my-order-card")).toHaveCount(4);
  });

  await test.step("Restoran otkazuje narudžbu na čekanju", async () => {
    await card(names.pending).getByRole("button", { name: `Otkaži narudžbu #${orders.pending.code}` }).click();
    await page.getByRole("dialog", { name: "Otkazati ovu narudžbu?" }).getByRole("button", { name: "Otkaži narudžbu" }).click();
    await expect(toast(page, "Narudžba je otkazana.")).toBeVisible();
    await expect(card(names.pending)).toHaveCount(0);
  });

  await test.step("Historija: filter po periodu i statusu, pa detalji narudžbe", async () => {
    await page.getByRole("tab", { name: /Historija/ }).click();
    await page.getByRole("button", { name: /Filteri/ }).click();
    const panel = page.getByRole("dialog", { name: "Filteri" });
    // Ordered today: Od and Do both today (dd/mm/yyyy, the field adds the slashes).
    const today = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sarajevo" }).format(new Date());
    const range = panel.getByRole("group", { name: "Naručeno" });
    await range.getByRole("textbox", { name: "Od", exact: true }).fill(today);
    await range.getByRole("textbox", { name: "Od", exact: true }).press("Enter");
    await range.getByRole("textbox", { name: "Do", exact: true }).fill(today);
    await range.getByRole("textbox", { name: "Do", exact: true }).press("Enter");
    await panel.getByRole("group", { name: "Status" }).getByRole("button", { name: "Otkazano" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("active-filter")).toHaveText(["Otkazano", `Naručeno: ${today} – ${today}`]);

    const table = page.getByRole("table", { name: "Historija narudžbi" });
    const rows = table.getByRole("row").filter({ hasText: names.pending });
    await expect(rows).toHaveCount(1);
    await expect(rows.getByTestId("order-status")).toHaveText("Otkazano");
    await rows.getByRole("link", { name: `Detalji narudžbe #${orders.pending.code}` }).click();
    await expect(page.getByTestId("order-hero").getByText(`Narudžba #${orders.pending.code}`, { exact: true })).toBeVisible();
  });

  await test.step("Na 375 px ništa ne izlazi u stranu", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "/my-orders");
    await expect(card(names.delivery)).toBeVisible();
    await expectNoSideScroll(page, "Aktivne");
    await card(names.delivery).getByRole("button", { name: /Prihvaćeno/ }).click();
    const tip = card(names.delivery).getByRole("tooltip");
    await expect(tip).toBeVisible();
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await page.getByRole("tab", { name: /Historija/ }).click();
    await expect(page.getByTestId("history-card").first()).toBeVisible();
    await expectNoSideScroll(page, "Historija");
  });

  await context.close();
});
