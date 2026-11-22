import { expect, test, type Page } from "@playwright/test";
import { storageState } from "../support/accounts.js";
import { apiAs } from "../support/api.js";
import { open, openProfileSection, reload, saveProfile } from "../support/ui.js";

// My profile of a restaurant and a store (design/profile/): one save for everything. The pause on
// orders is in order-pause.spec.ts, the pin and its confirmation in profile-location.spec.ts.

const openAllSections = async (page: Page) => {
  await expect(page.getByTestId("business-profile")).toBeVisible();
  const closed = page.locator('[data-testid^="profile-section-"] h2 button[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
};

test.describe("restaurant", () => {
  test.use({ storageState: storageState("restaurant") });

  test("edits its phone and saves it", async ({ page }) => {
    const api = await apiAs("restaurant");
    const { user: before } = await (await api.get("/api/users/me")).json();
    try {
      await open(page, "/my-profile");
      await expect(page.getByRole("heading", { level: 1, name: "Moj profil" })).toBeVisible();
      // Only Osnovne informacije is open.
      await expect(page.getByRole("button", { name: /Osnovne informacije/, expanded: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /Lokacija/, expanded: false })).toBeVisible();

      const phone = page.getByLabel("Telefon");
      await expect(phone).toHaveValue(before.phone);
      await phone.fill("061 999 888");
      await saveProfile(page);
      await reload(page);
      await expect(page.getByLabel("Telefon")).toHaveValue("061 999 888");
    } finally {
      await api.put("/api/users/me", {
        data: {
          first_name: before.first_name,
          last_name: before.last_name,
          business_name: before.business_name,
          city_id: before.city_id,
          address: before.address,
          phone: before.phone,
        },
      });
      await api.dispose();
    }
  });

  test("has no horizontal scroll at 375 px with every section open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "/my-profile");
    await openAllSections(page);
    await expect(page.getByLabel("Trenutna lozinka", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

test.describe("store", () => {
  test.use({ storageState: storageState("store") });

  // Withdraws the top-up this test asks for, so the shared store can ask again next time.
  test.afterEach(async () => {
    const api = await apiAs("store");
    const { requests } = await (await api.get("/api/credits/requests")).json();
    for (const request of requests as { id: number; request_type: string; status: string }[]) {
      if (request.request_type === "TOPUP" && request.status === "PENDING") await api.delete(`/api/credits/requests/${request.id}`);
    }
    await api.dispose();
  });

  test("asks for extra credits and sees the request as pending after saving", async ({ page }) => {
    await open(page, "/my-profile#topup");
    await expect(page.getByRole("button", { name: /Pretplata i krediti/, expanded: true })).toBeVisible();
    await page.getByRole("button", { name: "Kupi dodatne kredite" }).click();
    await page.getByTestId("topup-options").getByRole("button").first().click();
    await expect(page.getByTestId("chosen-topup")).toBeVisible();
    await saveProfile(page);
    await expect(page.getByTestId("credit-request").filter({ hasText: "Dodatni krediti" }).first().getByText("Na čekanju")).toBeVisible();
  });

  test("has no horizontal scroll at 375 px with every section open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "/my-profile");
    await openAllSections(page);
    await openProfileSection(page, /Pretplata i krediti/);
    await expect(page.getByTestId("credits-section")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

test.describe("company headquarters", () => {
  test.use({ storageState: storageState("hq") });

  test("still sees the old profile page", async ({ page }) => {
    await open(page, "/my-profile");
    await expect(page.getByText("Lični podaci")).toBeVisible();
    await expect(page.getByTestId("business-profile")).toHaveCount(0);
  });
});
