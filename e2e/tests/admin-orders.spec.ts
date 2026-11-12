import { expect, test } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { acceptOrder, apiAs, createProduct, sendOrderOf } from "../support/api.js";
import { searchMarketplace, toast } from "../support/ui.js";

// An admin settles a dispute: finds an accepted order by its code, reads it with both parties and
// cancels the whole order with a reason. Both sides are told why and the quantities go back on offer.
test("the admin finds an order by code and cancels it with a reason", async ({ browser }) => {
  const id = runId();
  const chicken = `E2E Admin Piletina ${id}`;
  const milk = `E2E Admin Mlijeko ${id}`;

  // Arrange through the API: two products (2 KM a kg), one order of 4 kg and 3 kg, accepted.
  const storeApi = await apiAs("store");
  const chickenProduct = await createProduct(storeApi, { name: chicken, quantity: 4 });
  const milkProduct = await createProduct(storeApi, { name: milk, quantity: 10 });
  const restaurantApi = await apiAs("restaurant");
  const order = await sendOrderOf(restaurantApi, [
    { productId: chickenProduct.id, quantity: 4, unitPrice: 2 },
    { productId: milkProduct.id, quantity: 3, unitPrice: 2 },
  ]);
  await restaurantApi.dispose();
  await acceptOrder(storeApi, order.id);
  await storeApi.dispose();
  const code = `#${order.code}`;

  const adminContext = await browser.newContext({ storageState: storageState("admin") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const admin = await adminContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Admin traži narudžbu po kodu i otvara je", async () => {
    await admin.goto("/admin/orders");
    await admin.getByPlaceholder("Proizvod, prodavnica, restoran ili kod").fill(code.toLowerCase());
    const row = admin.getByRole("row").filter({ hasText: chicken });
    await expect(row.getByText("Potvrđeno", { exact: true })).toBeVisible();
    await row.getByRole("link", { name: code }).click();
    await expect(admin.getByRole("heading", { level: 1, name: `Narudžba ${code}` })).toBeVisible();
    await expect(admin.getByTestId("order-item")).toHaveCount(2);
    // Both parties, each with a link to the user's page.
    await expect(admin.getByRole("link", { name: "Profil korisnika" })).toHaveCount(2);
  });

  await test.step("Admin otkazuje cijelu narudžbu s razlogom", async () => {
    await admin.getByRole("button", { name: "Otkaži", exact: true }).click();
    const dialog = admin.getByRole("dialog", { name: "Otkazati narudžbu?" });
    await dialog.getByLabel("Razlog").fill(`Spor oko kvaliteta ${id}`);
    await dialog.getByRole("button", { name: "Otkaži", exact: true }).click();
    await expect(toast(admin, "Narudžba je otkazana.")).toBeVisible();
    await expect(admin.getByText("Otkazano", { exact: true }).first()).toBeVisible();
    await expect(admin.getByTestId("order-history").filter({ hasText: `Spor oko kvaliteta ${id}` })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Otkaži", exact: true })).toHaveCount(0);
  });

  await test.step("Restoran dobija obavijest, a količina se vraća u ponudu", async () => {
    await restaurant.goto("/notifications");
    await expect(restaurant.getByText(`Narudžbu ${code} je otkazao administrator platforme.`)).toBeVisible();
    const card = await searchMarketplace(restaurant, chicken);
    await expect(card.getByText("4 kilogram (kg)")).toBeVisible();
  });

  await adminContext.close();
  await restaurantContext.close();
});
