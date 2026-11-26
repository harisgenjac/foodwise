import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { API_URL, storageState, uniqueName, type SeededRole } from "../support/accounts.js";
import {
  acceptOrder,
  apiAs,
  createProduct,
  createStoreWithoutPlan,
  sendDeliveryOrder,
  setPin,
  simulateCourier,
} from "../support/api.js";
import { sarajevoDate, sarajevoMinutesNow } from "../support/dates.js";
import { open, searchMarketplace, toast } from "../support/ui.js";

// The whole delivery flow with the mock provider (delivery phase 2), after the store accepted the
// order with a ready time: the courier's steps, a failure before the courier picked the goods up
// (the restaurant picks the order up itself, or cancels it) and a failure after it (an admin
// cancels). The courier is played through the server's dev-only route (simulateCourier; the
// panel's buttons are covered by order-page-data.spec.ts). The screens are
// not reloaded between the courier's steps: they follow the order live (SSE), also right after a
// page load (the happy path's last step sends the event as soon as the store's page opened).
//
// The order is sent and accepted through the API (cart-delivery.spec.ts clicks those). A fresh
// restaurant sends it: the seeded one is shared and may be at its limit of pending orders. The
// seeded store gets a pin for the test; the pin is removed and an order left open is cancelled by
// the admin in afterEach, so the store's packing list and Pickups stay clean. Runs on desktop
// Chrome and on the iPhone project.

const VISOKO = { latitude: 43.9889, longitude: 18.1781 };

const withSeeded = async (role: SeededRole, run: (api: APIRequestContext) => Promise<void>) => {
  const api = await apiAs(role);
  await run(api);
  await api.dispose();
};

interface Setup {
  productName: string;
  productId: number;
  orderId: number;
  code: string;
  restaurant: Page;
  store: Page;
}

let orderId: number | null = null;
let restaurantApi: APIRequestContext | null = null;

test.afterEach(async () => {
  if (orderId !== null) {
    await withSeeded("admin", async (admin) => {
      const { order } = await (await admin.get(`/api/admin/orders/${orderId}`)).json();
      if (["Pending", "Confirmed", "InDelivery"].includes(order.status)) {
        const response = await admin.post(`/api/admin/orders/${orderId}/cancel`, { data: { reason: "E2E cleanup" } });
        expect(response.ok(), `cancel ${orderId} → ${response.status()} ${await response.text()}`).toBe(true);
      }
    });
    orderId = null;
  }
  await restaurantApi?.dispose();
  restaurantApi = null;
  await withSeeded("store", (api) => setPin(api, null));
});

// A fresh restaurant about 2 km from the pinned seeded store sends 2 of 5 pieces for delivery, and
// the store accepts with the goods ready in 20 minutes. Both parties' screens are opened: the
// restaurant's order page and the store's order page.
const acceptedDelivery = async (browser: Browser, productPrefix: string): Promise<Setup> => {
  // Accepting needs a ready time today, a little ahead; near midnight there is none left.
  test.skip(24 * 60 - sarajevoMinutesNow() < 45, "no ready time left today");
  await withSeeded("store", (api) => setPin(api, VISOKO));
  const fresh = await createStoreWithoutPlan("RESTAURANT");
  restaurantApi = await request.newContext({ baseURL: API_URL, storageState: fresh.storageState });
  await setPin(restaurantApi, { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });

  const productName = uniqueName(productPrefix);
  let productId = 0;
  await withSeeded("store", async (api) => {
    productId = (await createProduct(api, { name: productName, unit: "kom", quantity: 5 })).id;
  });
  const order = await sendDeliveryOrder(restaurantApi, productId, 2);
  orderId = order.id;
  await withSeeded("store", async (api) => {
    await acceptOrder(api, order.id, new Date(Date.now() + 20 * 60_000));
  });

  const restaurant = await (await browser.newContext({ storageState: fresh.storageState })).newPage();
  const store = await (await browser.newContext({ storageState: storageState("store") })).newPage();
  await open(restaurant, `/orders/${order.id}`);
  // The restaurant's order page (design/order-details/): the hero says what happens now.
  await expect(restaurant.getByTestId("hero-title")).toHaveText("Prihvaćeno");
  await expect(restaurant.getByTestId("hero-line")).toContainText("Dostavna služba traži kurira");
  return { productName, productId, orderId: order.id, code: `#${order.code}`, restaurant, store };
};

const closePages = async (...pages: Page[]) => {
  for (const page of pages) await page.context().close();
};

test("the courier is assigned, picks the order up and delivers it, live on both screens", async ({ browser }) => {
  const { productName, orderId: id, restaurant, store } = await acceptedDelivery(browser, "E2E Dostava Hljeb");
  const packingCard = store.getByTestId("packing-order").filter({ hasText: productName });

  await test.step("Spisak za pakovanje: narudžba čeka kurira", async () => {
    await open(store, "/packing");
    await expect(packingCard.getByText("za kurira")).toBeVisible();
  });

  await test.step("Kurir dodijeljen: oba ekrana ga vide bez osvježavanja", async () => {
    // The mock's courier is random.
    let courier = { name: "", phone: "" };
    await withSeeded("store", async (api) => {
      const { order } = await simulateCourier(api, id, "courier_assigned");
      courier = { name: order.delivery.courier_name!, phone: order.delivery.courier_phone! };
    });
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Kurir je dodijeljen");
    const contact = restaurant.getByTestId("contact-courier");
    await expect(contact).toContainText(courier.name);
    await expect(contact.getByRole("link", { name: `Pozovi kurira ${courier.name}` })).toHaveAttribute("href", `tel:${courier.phone}`);
    await expect(packingCard.getByText(courier.name)).toBeVisible();
  });

  await test.step("Kurir preuzeo: narudžba je u dostavi i nestaje sa spiska za pakovanje", async () => {
    await withSeeded("store", (api) => simulateCourier(api, id, "picked_up").then(() => undefined));
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Kurir je na putu");
    await expect(restaurant.getByTestId("order-status")).toHaveText("Kurir preuzeo");
    await expect(packingCard).toHaveCount(0);
  });

  await test.step("Dostavljeno: narudžba je završena za obje strane", async () => {
    await open(store, `/orders/${id}`);
    await withSeeded("store", (api) => simulateCourier(api, id, "delivered").then(() => undefined));
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Isporučeno");
    await expect(restaurant.getByTestId("order-status")).toHaveText("Dostavljeno");
    await expect(store.getByText("Dostavljeno", { exact: true }).first()).toBeVisible();
    await expect(store.getByRole("button", { name: "Označi kao preuzeto" })).toHaveCount(0);
  });

  await closePages(restaurant, store);
});

test("after a failure before the pickup the restaurant picks the order up at the store itself", async ({ browser }) => {
  const { orderId: id, code, restaurant, store } = await acceptedDelivery(browser, "E2E Dostava Kifle");
  await open(store, `/orders/${id}`);

  await test.step("Dostava ne uspijeva: restoran bira, prodavnica čeka", async () => {
    await withSeeded("store", (api) => simulateCourier(api, id, "failed").then(() => undefined));
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Dostava nije uspjela");
    await expect(restaurant.getByTestId("hero-line")).toHaveText("Kurir nije mogao završiti dostavu. Odaberite kako dalje.");
    await expect(restaurant.getByTestId("delivery-failed")).toBeVisible();
    await expect(store.getByTestId("delivery-failed")).toContainText("Restoran bira da li će narudžbu preuzeti sam ili je otkazati.");
  });

  await test.step("Restoran preuzima sam sutra u 12:00", async () => {
    await restaurant.getByRole("button", { name: "Preuzet ću u prodavnici" }).click();
    const dialog = restaurant.getByRole("dialog", { name: "Preuzimanje umjesto dostave" });
    await expect(dialog.getByText(`Odaberite kada ćete preuzeti narudžbu ${code}`)).toBeVisible();
    await dialog.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
    await dialog.getByLabel("Datum preuzimanja").press("Enter");
    await dialog.getByLabel("Vrijeme preuzimanja").fill("12:00");
    await dialog.getByRole("button", { name: "Preuzet ću je" }).click();
    await expect(toast(restaurant, "Narudžba je prebačena na preuzimanje.")).toBeVisible();
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Preuzimate u prodavnici");
    await expect(restaurant.getByTestId("hero-line")).toHaveText("Preuzimanje sutra u 12:00");
    await expect(restaurant.getByTestId("delivery-failed")).toHaveCount(0);
  });

  await test.step("Prodavnica vidi preuzimanje i može ga označiti", async () => {
    await expect(store.getByText("Dostava nije uspjela, narudžba se preuzima u prodavnici")).toBeVisible();
    await expect(store.getByTestId("delivery-failed")).toHaveCount(0);
    await open(store, "/notifications");
    await expect(store.getByText(`će narudžbu ${code} preuzeti sam umjesto dostave.`)).toBeVisible();
  });

  await closePages(restaurant, store);
});

test("after a failure before the pickup the restaurant cancels and the goods go back on offer", async ({ browser }) => {
  const { productName, orderId: id, code, restaurant, store } = await acceptedDelivery(browser, "E2E Dostava Burek");

  await withSeeded("store", (api) => simulateCourier(api, id, "failed").then(() => undefined));
  await expect(restaurant.getByTestId("delivery-failed")).toBeVisible();

  await test.step("Restoran otkazuje narudžbu", async () => {
    await restaurant.getByTestId("delivery-failed").getByRole("button", { name: "Otkaži narudžbu" }).click();
    const dialog = restaurant.getByRole("dialog", { name: "Otkazati ovu narudžbu?" });
    await expect(dialog.getByText(`Narudžba ${code} će biti otkazana`)).toBeVisible();
    await dialog.getByRole("button", { name: "Otkaži narudžbu" }).click();
    await expect(toast(restaurant, "Narudžba je otkazana.")).toBeVisible();
    await expect(restaurant.getByTestId("hero-title")).toHaveText("Otkazali ste narudžbu");
    await expect(restaurant.getByTestId("delivery-failed")).toHaveCount(0);
  });

  await test.step("Količina se vraća u ponudu, prodavnica dobija obavijest", async () => {
    const card = await searchMarketplace(restaurant, productName);
    await expect(card.getByText("Dostupno: 5 kom")).toBeVisible();
    await open(store, "/notifications");
    await expect(store.getByText(`je otkazao narudžbu ${code} nakon neuspjele dostave.`)).toBeVisible();
  });

  await closePages(restaurant, store);
});

test("a failure after the pickup keeps the order with the courier until the admin cancels it", async ({ browser }) => {
  const { orderId: id, code, restaurant, store } = await acceptedDelivery(browser, "E2E Dostava Pita");
  await open(store, `/orders/${id}`);

  await test.step("Kurir preuzme pa dostava ne uspije: narudžba ostaje kod kurira", async () => {
    await withSeeded("store", async (api) => {
      await simulateCourier(api, id, "courier_assigned");
      await simulateCourier(api, id, "picked_up");
      await simulateCourier(api, id, "failed");
    });
    const reason = "Dostava nije uspjela: kurir je preuzeo narudžbu, ali je nije mogao dostaviti.";
    await expect(restaurant.getByTestId("hero-line")).toContainText("Kurir je preuzeo narudžbu, ali je nije mogao dostaviti.");
    await expect(store.getByText(reason)).toBeVisible();
    // The failure is on the last step: the courier had the goods.
    await expect(restaurant.getByTestId("order-step").last()).toHaveAttribute("data-state", "failed");
    // The restaurant has no choice to make: the goods left the store.
    await expect(restaurant.getByTestId("delivery-failed")).toHaveCount(0);
  });

  await test.step("Admin otkazuje narudžbu s razlogom", async () => {
    const admin = await (await browser.newContext({ storageState: storageState("admin") })).newPage();
    await open(admin, `/admin/orders/${id}`);
    await admin.getByRole("button", { name: "Otkaži", exact: true }).click();
    const dialog = admin.getByRole("dialog", { name: "Otkazati narudžbu?" });
    await expect(dialog.getByText("Količine se ne vraćaju u ponudu")).toBeVisible();
    await dialog.getByLabel("Razlog").fill("Kurir izgubio robu");
    await dialog.getByRole("button", { name: "Otkaži", exact: true }).click();
    await expect(admin.getByText("Otkazano", { exact: true }).first()).toBeVisible();
    await closePages(admin);
  });

  await test.step("Restoran vidi otkazanu narudžbu", async () => {
    await expect(restaurant.getByText("Otkazano", { exact: true }).first()).toBeVisible();
    await open(restaurant, "/notifications");
    await expect(restaurant.getByText(`Narudžbu ${code} je otkazao administrator platforme.`)).toBeVisible();
  });

  await closePages(restaurant, store);
});
