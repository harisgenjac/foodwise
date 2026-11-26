import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { API_URL, storageState, uniqueName, type SeededRole } from "../support/accounts.js";
import {
  acceptOrder,
  apiAs,
  createProduct,
  createStoreWithoutPlan,
  ok,
  sendDeliveryOrder,
  sendOrder,
  setPin,
  simulateCourier,
  type SimulatedOrder,
} from "../support/api.js";
import { sarajevoMinutesNow } from "../support/dates.js";
import { open, toast } from "../support/ui.js";

// The data behind the coming order page redesign, with the mock delivery provider:
// (1) the "Simulacija kurira" panel (on in the e2e build through VITE_DEV_TOOLS) assigns a courier
//     with a vehicle, the courier picks the order up, the arrival moves by +5 minutes and the order
//     is delivered; the mock's tracking page (/dev/tracking/:deliveryId, its tracking_url) shows
//     the courier, the vehicle, the status and the history;
// (2) a restaurant reports a problem through the API and the admin resolves it with a reply on
//     "Prijave problema"; the restaurant is notified;
// (3) a restaurant rates the courier of a delivered order through the API and the admin's order page
//     shows the rating and the comment.
// Fresh restaurants send the orders (the seeded one is shared and may be at its pending limit); the
// seeded store gets a pin for the delivery tests. afterEach removes the pin and has the admin cancel
// an order left open. Desktop project only.

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

type SessionState = string | Awaited<ReturnType<typeof createStoreWithoutPlan>>["storageState"];

const newPage = async (browser: Browser, state: SessionState) => {
  const page = await (await browser.newContext({ storageState: state })).newPage();
  pages.push(page);
  return page;
};

const freshRestaurant = async () => {
  const fresh = await createStoreWithoutPlan("RESTAURANT");
  restaurantApi = await request.newContext({ baseURL: API_URL, storageState: fresh.storageState });
  return { api: restaurantApi, storageState: fresh.storageState };
};

// A delivery order of 2 pieces from the pinned seeded store, accepted with the goods ready in 20
// minutes.
const acceptedDelivery = async (productPrefix: string) => {
  // Accepting needs a ready time today, a little ahead; near midnight there is none left.
  test.skip(24 * 60 - sarajevoMinutesNow() < 45, "no ready time left today");
  await withSeeded("store", (api) => setPin(api, VISOKO));
  const restaurant = await freshRestaurant();
  await setPin(restaurant.api, { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });
  const productName = uniqueName(productPrefix);
  const product = await withSeeded("store", (api) => createProduct(api, { name: productName, unit: "kom", quantity: 5 }));
  const order = await sendDeliveryOrder(restaurant.api, product.id, 2);
  orderId = order.id;
  await withSeeded("store", (api) => acceptOrder(api, order.id, new Date(Date.now() + 20 * 60_000)));
  return { order, restaurant };
};

const orderOf = async (api: APIRequestContext, id: number) =>
  (await ok<SimulatedOrder>(await api.get(`/api/orders/${id}`))).order;

test("the courier panel plays a delivery with a vehicle and a moved estimate, and the tracking page shows it", async ({
  browser,
}) => {
  const { order, restaurant } = await acceptedDelivery("E2E Praćenje Hljeb");
  const page = await newPage(browser, restaurant.storageState);
  await open(page, `/orders/${order.id}`);
  const panel = page.getByTestId("mock-courier");

  await test.step("Kurir dodijeljen sa slikom i vozilom", async () => {
    await expect(panel.getByRole("checkbox", { name: "Kurir sa slikom" })).toBeChecked();
    await panel.getByRole("button", { name: "Kurir dodijeljen" }).click();
    await expect(toast(page, "Korak kurira je simuliran.")).toBeVisible();
    const { delivery } = await orderOf(restaurant.api, order.id);
    expect(["BICYCLE", "SCOOTER", "CAR"]).toContain(delivery.courier_vehicle);
    expect(delivery.tracking_url).toContain(`/dev/tracking/`);
    await expect(page.getByTestId("contact-courier")).toContainText(delivery.courier_name!);
  });

  await test.step("Kurir preuzeo, dolazak +5 min, dostavljeno", async () => {
    await panel.getByRole("button", { name: "Kurir preuzeo" }).click();
    await expect(page.getByTestId("hero-title")).toHaveText("Kurir je na putu");
    const before = (await orderOf(restaurant.api, order.id)).delivery.estimated_delivery_at!;
    await panel.getByRole("button", { name: "Dolazak +5 min" }).click();
    await expect
      .poll(async () => new Date((await orderOf(restaurant.api, order.id)).delivery.estimated_delivery_at!).getTime())
      .toBe(new Date(before).getTime() + 5 * 60_000);
    await panel.getByRole("button", { name: "Dostavljeno" }).click();
    await expect(page.getByTestId("order-status")).toHaveText("Dostavljeno");
    await expect(panel.getByRole("button")).toHaveCount(0);
  });

  await test.step("Stranica praćenja: kurir, vozilo, status i historija", async () => {
    const { delivery } = await orderOf(restaurant.api, order.id);
    const vehicles: Record<string, string> = { BICYCLE: "Bicikl", SCOOTER: "Skuter", CAR: "Automobil" };
    const href = await panel.getByRole("link", { name: "Stranica praćenja" }).getAttribute("href");
    expect(href).toBe(delivery.tracking_url);
    await open(page, new URL(href!).pathname);
    const tracking = page.getByTestId("dev-tracking");
    await expect(tracking.getByRole("heading", { name: "Praćenje dostave" })).toBeVisible();
    await expect(tracking.getByText(delivery.courier_name!)).toBeVisible();
    await expect(tracking.getByText(vehicles[delivery.courier_vehicle!]!)).toBeVisible();
    await expect(tracking.getByRole("img", { name: delivery.courier_name! })).toBeVisible();
    const history = tracking.getByRole("list", { name: "Historija dostave" });
    await expect(history.getByRole("listitem")).toHaveCount(4);
    await expect(history.getByText("Nova procjena")).toBeVisible();
    await expect(tracking.getByText("Kurir još nije ocijenjen.")).toBeVisible();
  });
});

test("a problem report sent through the API is resolved by the admin with a reply", async ({ browser }) => {
  const restaurant = await freshRestaurant();
  const productName = uniqueName("E2E Prijava Mlijeko");
  const product = await withSeeded("store", (api) => createProduct(api, { name: productName, unit: "kom", quantity: 5 }));
  const order = await sendOrder(restaurant.api, product.id, 1);
  orderId = order.id;
  const text = `Pogrešno vrijeme preuzimanja ${productName}`;
  await ok(await restaurant.api.post(`/api/orders/${order.id}/problems`, { data: { reason: "PICKUP_TIME", text } }));

  const admin = await newPage(browser, storageState("admin"));
  await open(admin, "/admin/orders");
  await admin.getByRole("link", { name: "Prijave problema" }).click();
  const row = admin.getByRole("row").filter({ hasText: text });
  await expect(row.getByRole("link", { name: `#${order.code}` })).toHaveAttribute("href", `/admin/orders/${order.id}`);
  await expect(row.getByText("Problem s terminom preuzimanja")).toBeVisible();
  await expect(row.getByText("Otvorena")).toBeVisible();

  await row.getByRole("button", { name: "Obradi" }).click();
  const dialog = admin.getByRole("dialog", { name: `Prijava problema za narudžbu #${order.code}` });
  await dialog.getByLabel("Status").selectOption("RESOLVED");
  await dialog.getByLabel("Odgovor restoranu").fill("Prodavnica je potvrdila novo vrijeme.");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(toast(admin, "Prijava je sačuvana.")).toBeVisible();
  await expect(row.getByText("Riješena")).toBeVisible();
  await expect(row.getByText("Prodavnica je potvrdila novo vrijeme.")).toBeVisible();

  const { notifications } = await ok<{ notifications: { type: string; order_id: number; details: string }[] }>(
    await restaurant.api.get("/api/notifications"),
  );
  expect(notifications).toContainEqual(
    expect.objectContaining({ type: "ORDER_PROBLEM_RESOLVED", order_id: order.id, details: "Prodavnica je potvrdila novo vrijeme." }),
  );
  const { order: details } = await ok<{ order: { problems: { status: string; admin_reply: string }[] } }>(
    await restaurant.api.get(`/api/orders/${order.id}`),
  );
  expect(details.problems).toEqual([expect.objectContaining({ status: "RESOLVED", admin_reply: "Prodavnica je potvrdila novo vrijeme." })]);
});

test("a courier rating sent through the API shows on the admin's order page", async ({ browser }) => {
  const { order, restaurant } = await acceptedDelivery("E2E Ocjena Kifle");
  await withSeeded("store", async (api) => {
    await simulateCourier(api, order.id, "courier_assigned");
    await simulateCourier(api, order.id, "picked_up");
    await simulateCourier(api, order.id, "delivered");
  });
  await ok(await restaurant.api.post(`/api/orders/${order.id}/courier-rating`, { data: { rating: 5, comment: "Brz i ljubazan kurir." } }));

  const admin = await newPage(browser, storageState("admin"));
  await open(admin, `/admin/orders/${order.id}`);
  const feedback = admin.getByTestId("admin-order-feedback");
  await expect(feedback.getByText("Ocjena kurira")).toBeVisible();
  await expect(feedback.getByText("5/5")).toBeVisible();
  await expect(feedback.getByText("Brz i ljubazan kurir.")).toBeVisible();
});
