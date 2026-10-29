import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { createStoreWithoutPlan } from "../support/api.js";
import { dialogWith, expectAvailableCredits, fillProductForm, toast } from "../support/ui.js";

test("a store without a plan requests one, the admin approves it and the store publishes", async ({ browser }) => {
  // A fresh store each run: the seeded store already has a plan, and this one gets one here.
  const account = await createStoreWithoutPlan();
  const storeContext = await browser.newContext({ storageState: account.storageState });
  const adminContext = await browser.newContext({ storageState: storageState("admin") });
  const store = await storeContext.newPage();
  const admin = await adminContext.newPage();
  const productName = uniqueName("E2E Kifle");

  await test.step("Prodavnica bez plana ne može objaviti proizvod", async () => {
    await store.goto("/add-product");
    await expect(store.getByText("Za ovo je potrebna pretplata.")).toBeVisible();
    await fillProductForm(store, productName);
    await store.getByRole("button", { name: "Dodaj proizvod" }).click();
    const notice = store.getByRole("alert").filter({ hasText: "Nemate dovoljno kredita" });
    await expect(notice).toBeVisible();
    await notice.getByRole("link", { name: "Odaberi pretplatu" }).click();
    await expect(store).toHaveURL(/\/my-profile#subscription$/);
  });

  await test.step("Prodavnica traži plan Standard za ovaj mjesec", async () => {
    const standard = store.locator("#plan-options > div").filter({ has: store.getByText("Standard", { exact: true }) });
    await standard.getByRole("button", { name: "Odaberi" }).click();
    const dialog = dialogWith(store, "Pretplata: Standard");
    await expect(dialog.getByRole("radio", { name: "Samo ovaj mjesec" })).toBeChecked();
    await dialog.getByRole("button", { name: "Pošalji zahtjev" }).click();
    await expect(toast(store, "Zahtjev je poslan. Administrator će ga uskoro pregledati.")).toBeVisible();
  });

  await test.step("Admin vidi zahtjev i odobrava ga", async () => {
    await admin.goto("/notifications");
    await expect(admin.getByText(`Novi zahtjev za pretplatu: ${account.businessName}, 50 kredita`)).toBeVisible();
    await admin.goto("/admin/credit-requests");
    const row = admin.getByRole("row").filter({ hasText: account.businessName });
    await expect(row.getByText("Na čekanju")).toBeVisible();
    await row.getByRole("button", { name: "Odobri" }).click();
    await dialogWith(admin, "Odobriti zahtjev?").getByRole("button", { name: "Odobri" }).click();
    await expect(toast(admin, "Zahtjev je odobren.")).toBeVisible();
  });

  await test.step("Prodavnica dobija obavijest i kredite", async () => {
    await store.goto("/notifications");
    await expect(store.getByText("Vaša pretplata (50 kredita) je odobrena.")).toBeVisible();
    await expectAvailableCredits(store, 50);
  });

  await test.step("Prodavnica objavljuje prvi proizvod za 1 kredit", async () => {
    await store.goto("/add-product");
    await expect(store.getByText("Ovo troši 1 kredit (preostalo: 50)")).toBeVisible();
    await fillProductForm(store, productName);
    await store.getByRole("button", { name: "Dodaj proizvod" }).click();
    await expect(toast(store, "Proizvod uspješno kreiran.")).toBeVisible();
    await expectAvailableCredits(store, 49);
  });

  await storeContext.close();
  await adminContext.close();
});
