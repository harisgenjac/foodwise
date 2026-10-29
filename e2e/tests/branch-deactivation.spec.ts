import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD, storageState, uniqueName } from "../support/accounts.js";
import { acceptReservation, apiAs, completeReservation, createProduct, myId, reserve } from "../support/api.js";
import { expectNotInMarketplace, searchMarketplace, submitLoginForm, toast } from "../support/ui.js";

// Only this test uses the seeded company's branch. Whatever happens, it ends active and without
// the accepted pickup it created, so a retry or the next run can deactivate it again.
let branchId: number | undefined;
let acceptedReservationId: number | undefined;
test.afterEach(async () => {
  if (acceptedReservationId !== undefined) {
    const branch = await apiAs("branch");
    await branch.patch(`/api/reservations/${acceptedReservationId}/complete`); // 400 once picked up
    await branch.dispose();
  }
  if (branchId !== undefined) {
    const hq = await apiAs("hq");
    await hq.post(`/api/company/branches/${branchId}/reactivate`); // 400 when it is active
    await hq.dispose();
  }
});

test("headquarters can deactivate a branch only after its accepted pickups, and reactivate it", async ({
  browser,
}) => {
  test.slow();
  const productName = uniqueName("E2E Poslovnica");

  // Arrange: the branch offers a product, the restaurant reserves it and the branch accepts.
  const branchApi = await apiAs("branch");
  const restaurantApi = await apiAs("restaurant");
  branchId = await myId(branchApi);
  const product = await createProduct(branchApi, { name: productName, quantity: 10 });
  const reservation = await reserve(restaurantApi, product.id, 2);
  await acceptReservation(branchApi, reservation.id);
  acceptedReservationId = reservation.id;
  await restaurantApi.dispose();

  const hqContext = await browser.newContext({ storageState: storageState("hq") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const loginContext = await browser.newContext();
  const hq = await hqContext.newPage();
  const restaurant = await restaurantContext.newPage();
  const deactivateDialog = hq.getByRole("dialog", { name: "Deaktivirati poslovnicu?" });

  await test.step("Restoran vidi ponudu poslovnice", async () => {
    await expect(await searchMarketplace(restaurant, productName)).toHaveCount(1);
  });

  await test.step("Centrala ne može deaktivirati poslovnicu s prihvaćenim preuzimanjem", async () => {
    await hq.goto(`/company/branches/${branchId}`);
    await expect(hq.getByRole("heading", { level: 1, name: ACCOUNTS.branch.businessName })).toBeVisible();
    await hq.getByRole("button", { name: "Deaktiviraj" }).click();
    await deactivateDialog.getByRole("button", { name: "Deaktiviraj" }).click();
    await expect(
      toast(hq, /Poslovnica još ima prihvaćena preuzimanja \(\d+\)\. Sačekajte da budu preuzeta ili otkazana\./),
    ).toBeVisible();
    await deactivateDialog.getByRole("button", { name: "Odustani" }).click();
    await expect(deactivateDialog).toBeHidden();
  });

  await test.step("Poslovnica označava preuzimanje (API)", async () => {
    await completeReservation(branchApi, reservation.id);
    acceptedReservationId = undefined;
    await branchApi.dispose();
  });

  await test.step("Centrala deaktivira poslovnicu", async () => {
    await hq.getByRole("button", { name: "Deaktiviraj" }).click();
    await deactivateDialog.getByRole("button", { name: "Deaktiviraj" }).click();
    await expect(toast(hq, "Poslovnica je deaktivirana.")).toBeVisible();
    await expect(hq.getByRole("heading", { name: "Poslovnica je deaktivirana" })).toBeVisible();
  });

  await test.step("Ponuda nestaje, poslovnica se ne može prijaviti", async () => {
    await expectNotInMarketplace(restaurant, productName);
    const login = await loginContext.newPage();
    await submitLoginForm(login, ACCOUNTS.branch.email, PASSWORD);
    await expect(login.getByText("Ova poslovnica je deaktivirana. Obratite se svojoj firmi.")).toBeVisible();
    await expect(login).toHaveURL(/\/login$/);
  });

  await test.step("Centrala ponovo aktivira poslovnicu, ponuda se vraća", async () => {
    await hq.getByRole("button", { name: "Ponovo aktiviraj" }).click();
    await hq
      .getByRole("dialog", { name: "Ponovo aktivirati poslovnicu?" })
      .getByRole("button", { name: "Ponovo aktiviraj" })
      .click();
    await expect(toast(hq, "Poslovnica je ponovo aktivirana.")).toBeVisible();
    await expect(await searchMarketplace(restaurant, productName)).toHaveCount(1);
  });

  await hqContext.close();
  await restaurantContext.close();
  await loginContext.close();
});
