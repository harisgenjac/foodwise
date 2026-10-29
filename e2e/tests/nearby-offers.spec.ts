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

  const cards = await searchMarketplace(page, prefix);
  const card = (name: string) => cards.filter({ has: page.getByRole("heading", { name }) });
  const radius = page.getByRole("combobox", { name: "Udaljenost" });
  const hint = page.getByText("Još 1 ponuda je dalje od 10 km.");

  await test.step("Do 10 km: samo Breza, uz napomenu o daljim ponudama", async () => {
    await expect(radius).toHaveValue("10");
    await expect(cards).toHaveCount(1);
    await expect(card(brezaProduct).getByText("Breza · 7 km")).toBeVisible();
    await expect(hint).toBeVisible();
    await expect(page.getByRole("button", { name: "Prikaži do 20 km" })).toBeVisible();
  });

  await test.step("Svi gradovi: i Tuzla", async () => {
    await radius.selectOption({ label: "Svi gradovi" });
    await expect(cards).toHaveCount(2);
    await expect(card(tuzlaProduct).getByText("Tuzla · 73 km")).toBeVisible();
    await expect(hint).toBeHidden();
  });

  await test.step("Grad Tuzla: prikazuje se i uz mali radijus", async () => {
    await radius.selectOption({ label: "Do 5 km" });
    await page.getByRole("combobox", { name: "Grad" }).selectOption({ label: "Tuzla" });
    await expect(cards).toHaveCount(1);
    await expect(card(tuzlaProduct).getByText("Tuzla · 73 km")).toBeVisible();
    await expect(page.getByText(/ponud[ae] (je|su) dalje od/)).toBeHidden();
  });
});
