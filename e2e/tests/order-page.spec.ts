import AxeBuilder from "@axe-core/playwright";
import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { API_URL, uniqueName, type SeededRole } from "../support/accounts.js";
import {
  acceptOrder,
  apiAs,
  createProduct,
  createStoreWithoutPlan,
  ok,
  sendDeliveryOrder,
  sendOrder,
  setPin,
} from "../support/api.js";
import { sarajevoMinutesNow } from "../support/dates.js";
import { open, toast } from "../support/ui.js";

// The restaurant's order page (design/order-details/), with the mock delivery provider:
// (1) a delivery order: the "Simulacija kurira" panel assigns a courier and the courier picks the
//     order up; the page shows the courier with the vehicle and "stiže za N min"; the order is
//     delivered and the restaurant rates the courier on the page;
// (2) a restaurant reports a problem from the page and sees the confirmation;
// (3) no horizontal scroll at 375 px, the hero passes axe's colour contrast.
// (A failed delivery switched to pickup is in delivery-flow.spec.ts.)
// Fresh restaurants send the orders; the seeded store gets a pin for the delivery. afterEach removes
// the pin and has the admin cancel an order left open. Desktop project only.

const VISOKO = { latitude: 43.9889, longitude: 18.1781 };

const withSeeded = async <T>(role: SeededRole, run: (api: APIRequestContext) => Promise<T>) => {
  const api = await apiAs(role);
  try {
    return await run(api);
  } finally {
    await api.dispose();
  }
};

let orderId: number | null = null;
let restaurantApi: APIRequestContext | null = null;
const pages: Page[] = [];

test.afterEach(async () => {
  for (const page of pages.splice(0)) await page.context().close();
  if (orderId !== null) {
    const id = orderId;
    await withSeeded("admin", async (admin) => {
      const { order } = await (await admin.get(`/api/admin/orders/${id}`)).json();
      if (["Pending", "Confirmed", "InDelivery"].includes(order.status)) {
        await ok(await admin.post(`/api/admin/orders/${id}/cancel`, { data: { reason: "E2E cleanup" } }));
      }
    });
    orderId = null;
  }
  await restaurantApi?.dispose();
  restaurantApi = null;
  await withSeeded("store", (api) => setPin(api, null));
});

const freshRestaurantPage = async (browser: Browser) => {
  const fresh = await createStoreWithoutPlan("RESTAURANT");
  restaurantApi = await request.newContext({ baseURL: API_URL, storageState: fresh.storageState });
  const page = await (await browser.newContext({ storageState: fresh.storageState })).newPage();
  pages.push(page);
  return { api: restaurantApi, page };
};

// axe's colour-contrast rule on the page's content as it is now (the hero's peach, coral and lime
// included). Only <main>: the sticky header is see-through over the scrolled hero, which is not this
// page's to fix.
const expectContrast = async (page: Page) => {
  const results = await new AxeBuilder({ page }).include("main").withRules(["color-contrast"]).analyze();
  const failures = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(" ")}: ${node.failureSummary?.replace(/\s+/g, " ")}`),
  );
  expect(failures).toEqual([]);
};

const expectNoHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test("a delivery shows the courier with the vehicle and the countdown, then the restaurant rates the courier", async ({ browser }) => {
  // Accepting needs a ready time today, a little ahead; near midnight there is none left.
  test.skip(24 * 60 - sarajevoMinutesNow() < 45, "no ready time left today");
  await withSeeded("store", (api) => setPin(api, VISOKO));
  const { api, page } = await freshRestaurantPage(browser);
  await setPin(api, { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });
  const productName = uniqueName("E2E Stranica Kifle");
  const product = await withSeeded("store", (store) => createProduct(store, { name: productName, unit: "kom", quantity: 5 }));
  const order = await sendDeliveryOrder(api, product.id, 2);
  orderId = order.id;

  await test.step("Na čekanju: žuta rečenica i Otkaži narudžbu", async () => {
    await open(page, `/orders/${order.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Čeka odgovor prodavnice" })).toBeVisible();
    await expect(page.getByTestId("order-hero").getByRole("button", { name: "Otkaži narudžbu" })).toBeVisible();
    await expect(page.getByTestId("order-step")).toHaveCount(5);
    await expectContrast(page);
  });

  await test.step("Prihvaćeno, kurir dodijeljen i preuzeo: kurir s vozilom, stiže za N min", async () => {
    await withSeeded("store", (store) => acceptOrder(store, order.id, new Date(Date.now() + 20 * 60_000)));
    await expect(page.getByTestId("hero-title")).toHaveText("Prihvaćeno");
    const panel = page.getByTestId("mock-courier");
    await panel.getByRole("button", { name: "Kurir dodijeljen" }).click();
    await expect(toast(page, "Korak kurira je simuliran.")).toBeVisible();
    await expect(page.getByTestId("hero-title")).toHaveText("Kurir je dodijeljen");
    const courier = page.getByTestId("contact-courier");
    await expect(courier.getByRole("img", { name: /Fotografija kurira/ })).toBeVisible();
    await expect(courier.getByTestId("courier-vehicle")).toBeVisible();
    await expect(courier).toContainText(/Kurir · (Bicikl|Skuter|Automobil) · /);
    await expect(courier.getByRole("link", { name: /Pozovi kurira/ })).toHaveAttribute("href", /^tel:/);
    await expect(courier.getByRole("link", { name: /stranica praćenja/ })).toHaveAttribute("href", /\/dev\/tracking\//);

    await panel.getByRole("button", { name: "Kurir preuzeo" }).click();
    await expect(page.getByTestId("hero-title")).toHaveText("Kurir je na putu");
    await expect(page.getByTestId("hero-line")).toContainText(/Stiže (za \d+ min|svakog trenutka) · dolazak u restoran u \d\d:\d\d/);
    await expect(page.getByTestId("time-card")).toContainText(/Kurir stiže( za)?/);
    await expect(page.getByTestId("time-card")).toContainText(/Dolazak u \d\d:\d\d/);
    await expect(page.getByTestId("money-card")).toContainText("Kuriru plaćate gotovinom");
    await expectContrast(page);
  });

  await test.step("Isporučeno: limeta, puni pečat, ocjena kurira", async () => {
    await page.getByTestId("mock-courier").getByRole("button", { name: "Dostavljeno" }).click();
    await expect(page.getByTestId("hero-title")).toHaveText("Isporučeno");
    await expect(page.getByTestId("success-seal")).toHaveAttribute("data-filled", "true");
    const rating = page.getByTestId("courier-rating");
    await expect(rating.getByRole("heading", { name: "Kako je prošla dostava?" })).toBeVisible();
    await expect(rating.getByRole("button", { name: "Pošalji ocjenu" })).toBeDisabled();
    await rating.getByRole("button", { name: "Ocjena kurira: 4 od 5" }).click();
    await rating.getByLabel("Komentar (nije obavezno)").fill("Brzo i ljubazno.");
    await rating.getByRole("button", { name: "Pošalji ocjenu" }).click();
    await expect(rating.getByRole("heading", { name: "Hvala na ocjeni!" })).toBeVisible();
    await expect(rating.getByRole("button", { name: "Ocjena kurira: 4 od 5" })).toBeDisabled();
    await expect(rating.getByRole("button", { name: "Ocjena kurira: 4 od 5" })).toHaveAttribute("aria-pressed", "true");
    await expectContrast(page);
  });

  await test.step("Na telefonu (375 px) nema vodoravnog skrolanja", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, `/orders/${order.id}`);
    await expect(page.getByTestId("hero-title")).toHaveText("Isporučeno");
    await expectNoHorizontalScroll(page);
  });

  const { order: details } = await ok<{ order: { courier_rating: { rating: number; comment: string } } }>(
    await api.get(`/api/orders/${order.id}`),
  );
  expect(details.courier_rating).toEqual(expect.objectContaining({ rating: 4, comment: "Brzo i ljubazno." }));
});

test("a restaurant reports a problem from the order page and sees the confirmation", async ({ browser }) => {
  const { api, page } = await freshRestaurantPage(browser);
  const productName = uniqueName("E2E Prijava Jogurt");
  const product = await withSeeded("store", (store) => createProduct(store, { name: productName, unit: "kom", quantity: 5 }));
  const order = await sendOrder(api, product.id, 1);
  orderId = order.id;

  await open(page, `/orders/${order.id}`);
  const reportButton = page.getByRole("button", { name: "Prijavi problem" });
  await reportButton.click();
  const dialog = page.getByRole("dialog", { name: "Prijavi problem" });
  await expect(dialog.getByText(`Narudžba #${order.code}`)).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(5);
  await expect(dialog.getByRole("button", { name: "Pošalji prijavu" })).toBeDisabled();

  await test.step("Na telefonu dijalog stane bez vodoravnog skrolanja", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await dialog.getByRole("radio", { name: "Nedostaje stavka" }).check();
  await dialog.getByLabel("Opis (nije obavezno)").fill(`Nedostaje ${productName}`);
  await dialog.getByRole("button", { name: "Pošalji prijavu" }).click();
  // The same dialog, now named by the confirmation.
  const sent = page.getByRole("dialog", { name: "Prijava je poslana" });
  await expect(sent.getByText("Podrška će vas kontaktirati u najkraćem roku.")).toBeVisible();
  await sent.getByRole("button", { name: "Zatvori" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The report shows in "Detalji narudžbe" with its status.
  await page.getByRole("button", { name: /Detalji narudžbe/ }).click();
  const report = page.getByTestId("problem-report");
  await expect(report).toContainText("Nedostaje stavka");
  await expect(report).toContainText("Otvorena");
  await expect(report).toContainText(`Nedostaje ${productName}`);
});
