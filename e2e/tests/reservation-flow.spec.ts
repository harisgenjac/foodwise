import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, runId, storageState } from "../support/accounts.js";
import { sarajevoDate } from "../support/dates.js";
import { toast } from "../support/ui.js";

const pickupCard = (page: Page, productName: string) =>
  page.getByRole("article").filter({ has: page.getByRole("heading", { name: productName }) });

test("a store publishes a product, a restaurant reserves it and the store hands it over", async ({ browser }) => {
  const productName = `E2E Mlijeko ${runId()}`;
  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  // The store publishes a product.
  await store.goto("/add-product");
  await store.getByLabel("Naziv proizvoda").fill(productName);
  await store.getByRole("button", { name: "Mliječni proizvodi" }).click();
  await store.getByLabel("Originalna cijena").fill("4");
  await store.getByLabel("Snižena cijena").fill("2");
  await store.getByLabel("Količina").fill("10");
  await store.getByLabel("Jedinica mjere").selectOption({ label: "kilogram (kg)" });
  await store.getByRole("button", { name: "Za 3 dana" }).click();
  await store.getByRole("button", { name: "Dodaj proizvod" }).click();
  await expect(toast(store, "Proizvod uspješno kreiran.")).toBeVisible();

  // The restaurant finds it in the marketplace and reserves part of it for tomorrow.
  await restaurant.goto("/browse-products");
  await restaurant.getByPlaceholder("Pretraga po imenu").fill(productName);
  const productCard = restaurant
    .getByTestId("product-card")
    .filter({ has: restaurant.getByRole("heading", { name: productName }) });
  await expect(productCard).toHaveCount(1);
  await expect(productCard.getByText(ACCOUNTS.store.businessName)).toBeVisible();
  await productCard.getByRole("button", { name: "Rezerviši" }).click();
  const reserveDialog = restaurant.getByRole("dialog");
  await reserveDialog.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
  await reserveDialog.getByLabel("Datum preuzimanja").press("Enter");
  await reserveDialog.getByLabel("Vrijeme preuzimanja").fill("14:30");
  await reserveDialog.getByLabel("Količina").fill("4");
  await reserveDialog.getByRole("button", { name: "Potvrdi" }).click();
  await expect(toast(restaurant, "Rezervacija uspješno kreirana.")).toBeVisible();
  await expect(reserveDialog).toBeHidden();

  // The store sees the request and accepts it.
  await store.goto("/reservations");
  await store.getByPlaceholder("Pretraga po imenu").fill(productName);
  const reservationCard = store
    .getByTestId("reservation-card")
    .filter({ has: store.getByRole("heading", { name: productName }) });
  await expect(reservationCard).toHaveCount(1);
  await expect(reservationCard.getByText("Na čekanju")).toBeVisible();
  await expect(reservationCard.getByText(ACCOUNTS.restaurant.businessName)).toBeVisible();
  await reservationCard.getByRole("button", { name: "Prihvati" }).click();
  await store.getByRole("dialog", { name: "Prihvatiti rezervaciju?" }).getByRole("button", { name: "Prihvati" }).click();
  await expect(toast(store, "Rezervacija je uspješno prihvaćena.")).toBeVisible();

  // Both see it under Pickups, tomorrow.
  for (const [page, otherParty] of [
    [store, ACCOUNTS.restaurant.businessName],
    [restaurant, ACCOUNTS.store.businessName],
  ] as const) {
    await page.goto("/pickups");
    await page.getByRole("tab", { name: /Nadolazeće/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Sutra" })).toBeVisible();
    await expect(pickupCard(page, productName).getByText(otherParty)).toBeVisible();
  }
  await expect(pickupCard(restaurant, productName).getByText("Spremno za preuzimanje")).toBeVisible();

  // The store marks it picked up.
  await pickupCard(store, productName).getByRole("button", { name: "Označi kao preuzeto" }).click();
  await store
    .getByRole("dialog", { name: "Potvrditi preuzimanje?" })
    .getByRole("button", { name: "Potvrdi preuzimanje" })
    .click();
  await expect(toast(store, "Rezervacija je označena kao preuzeta.")).toBeVisible();

  // The restaurant sees it as picked up and gets the notification.
  await restaurant.reload();
  await restaurant.getByRole("tab", { name: /Preuzeto/ }).click();
  await expect(pickupCard(restaurant, productName).getByText(/^Preuzeto /)).toBeVisible();
  await restaurant.goto("/notifications");
  await expect(restaurant.getByText(`Preuzimanje potvrđeno: 4kg ${productName}.`)).toBeVisible();

  await storeContext.close();
  await restaurantContext.close();
});
