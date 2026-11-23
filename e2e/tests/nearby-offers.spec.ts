import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { searchMarketplace } from "../support/ui.js";

test.use({ storageState: storageState("restaurant") });

test("the marketplace shows nearby offers first and the far ones on request", async ({ page }) => {
  // Breza is 7 km from the restaurant in Visoko, Tuzla 73 km.
  const prefix = uniqueName("E2E Blizu");
  const brezaProduct = `${prefix} Breza`;
  const tuzlaProduct = `${prefix} Tuzla`;
  for (const [role, name] of [
    ["brezaStore", brezaProduct],
    ["tuzlaStore", tuzlaProduct],
  ] as const) {
    const api = await apiAs(role);
    await createProduct(api, { name });
    await api.dispose();
  }

  // Search groups the offers by store; each store's header has its distance and city.
  const cards = await searchMarketplace(page, prefix);
  const card = (name: string) => page.getByTestId("search-store").filter({ hasText: name });
  const band = page.getByTestId("more-offers");
  const drawer = page.getByRole("dialog", { name: "Filteri" });
  const openFilters = () => page.getByRole("button", { name: /^Filteri/ }).click();

  await test.step("Do 10 km: samo Breza, uz napomenu o daljim ponudama", async () => {
    await expect(page.getByTestId("active-filter").filter({ hasText: "Do 10 km" })).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(card(brezaProduct).getByText("7 km · Breza")).toBeVisible();
    await expect(band).toContainText("Još 1 ponuda je dalje od 10 km.");
    await expect(band.getByRole("button", { name: "Prikaži do 20 km" })).toBeVisible();
  });

  await test.step("Bez ograničenja: i Tuzla", async () => {
    await openFilters();
    await drawer.getByRole("button", { name: "Bez ograničenja" }).click();
    await expect(cards).toHaveCount(2);
    await expect(card(tuzlaProduct).getByText("73 km · Tuzla")).toBeVisible();
    await expect(band).toBeHidden();
  });

  await test.step("Grad Tuzla: udaljenost prelazi na bez ograničenja", async () => {
    await drawer.getByRole("button", { name: "Do 5 km" }).click();
    await drawer.getByLabel("Grad").selectOption({ label: "Tuzla" });
    await expect(drawer.getByRole("button", { name: "Bez ograničenja" })).toHaveAttribute("aria-pressed", "true");
    await drawer.getByRole("button", { name: "Zatvori", exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(card(tuzlaProduct).getByText("73 km · Tuzla")).toBeVisible();
    await expect(page.getByTestId("active-filter")).toHaveText(["Tuzla"]);
    await expect(band).toBeHidden();
  });
});
