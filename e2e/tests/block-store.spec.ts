import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD, runId, storageState } from "../support/accounts.js";
import { apiAs, createProduct, myId } from "../support/api.js";
import { expectNotInMarketplace, searchMarketplace, submitLoginForm, toast } from "../support/ui.js";

// Only this test uses blockStore. Whatever happens, it ends unblocked, so a retry or the next
// run starts from a working account (its saved session works again once it is unblocked).
let blockStoreId: number | undefined;
test.afterEach(async () => {
  if (blockStoreId === undefined) return;
  const admin = await apiAs("admin");
  await admin.post(`/api/admin/users/${blockStoreId}/unblock`); // 400 when it is not blocked
  await admin.dispose();
});

test("a blocked store loses its session and its offers until the admin unblocks it", async ({ browser }) => {
  const id = runId();
  const productName = `E2E Blokirano ${id}`;
  const reason = `E2E provjera blokade ${id}`;
  const storeApi = await apiAs("blockStore");
  blockStoreId = await myId(storeApi);
  await createProduct(storeApi, { name: productName });
  await storeApi.dispose();

  const adminContext = await browser.newContext({ storageState: storageState("admin") });
  const storeContext = await browser.newContext({ storageState: storageState("blockStore") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const admin = await adminContext.newPage();
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Prodavnica je prijavljena, restoran vidi ponudu", async () => {
    await expect(await searchMarketplace(restaurant, productName)).toHaveCount(1);
    await store.goto("/my-products");
    await expect(store.getByRole("heading", { level: 1, name: "Moji Proizvodi" })).toBeVisible();
  });

  await test.step("Admin blokira prodavnicu s razlogom", async () => {
    await admin.goto(`/admin/users/${blockStoreId}`);
    await admin.getByRole("button", { name: "Blokiraj nalog" }).click();
    const dialog = admin.getByRole("dialog", { name: "Blokirati nalog?" });
    await dialog.getByLabel("Razlog").fill(reason);
    await dialog.getByRole("button", { name: "Blokiraj", exact: true }).click();
    await expect(toast(admin, "Nalog je blokiran.")).toBeVisible();
    await expect(admin.getByText(`Razlog: ${reason}`)).toBeVisible();
  });

  await test.step("Sesija prodavnice je prekinuta, prijava pokazuje razlog", async () => {
    await store.goto("/my-products");
    await expect(store).toHaveURL(/\/login$/);
    await submitLoginForm(store, ACCOUNTS.blockStore.email, PASSWORD);
    await expect(store.getByText(`Vaš nalog je blokiran. Razlog: ${reason}`)).toBeVisible();
    await expect(store).toHaveURL(/\/login$/);
  });

  await test.step("Restoran više ne vidi ponudu", () => expectNotInMarketplace(restaurant, productName));

  await test.step("Admin deblokira prodavnicu, ponuda se vraća", async () => {
    await admin.getByRole("button", { name: "Deblokiraj nalog" }).click();
    await admin
      .getByRole("dialog", { name: "Deblokirati nalog?" })
      .getByRole("button", { name: "Deblokiraj", exact: true })
      .click();
    await expect(toast(admin, "Nalog je odblokiran.")).toBeVisible();
    await expect(await searchMarketplace(restaurant, productName)).toHaveCount(1);
  });

  await adminContext.close();
  await storeContext.close();
  await restaurantContext.close();
});
