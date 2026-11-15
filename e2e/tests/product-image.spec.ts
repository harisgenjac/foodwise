import { expect, test, type Page } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { fillProductForm, open, toast } from "../support/ui.js";

test.use({ storageState: storageState("store") });

// A 1×1 PNG: the browser shows it, so the preview and the card load a real image.
const PNG = {
  name: "slika.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

const productCard = async (page: Page, name: string) => {
  await open(page, "/my-products");
  await page.getByPlaceholder("Pretraga po imenu").fill(name);
  return page.getByTestId("product-card").filter({ hasText: name });
};

// Runs on desktop Chrome and on the iPhone project (phone width).
test("a store gives a product its own image and changes it after publishing", async ({ page }) => {
  const name = uniqueName("E2E Slika");

  await test.step("Novi proizvod s postavljenom slikom", async () => {
    await open(page, "/add-product");
    await fillProductForm(page, name);
    await page.getByLabel("Postavi sliku").setInputFiles(PNG);
    await expect(page.getByAltText("Trenutna slika proizvoda")).toHaveAttribute("src", /\/uploads\/products\/\d+-/);
    await page.getByRole("button", { name: "Dodaj proizvod" }).click();
    await expect(toast(page, "Proizvod uspješno kreiran.")).toBeVisible();

    const card = await productCard(page, name);
    await expect(card.getByRole("img", { name })).toHaveAttribute("src", /\/uploads\/products\/\d+-/);
  });

  await test.step("Uređivanje: predložena slika umjesto postavljene", async () => {
    const card = await productCard(page, name);
    await card.getByRole("link", { name: "Uredi" }).click();
    await expect(page.getByAltText("Trenutna slika proizvoda")).toHaveAttribute("src", /\/uploads\/products\//);

    await page.getByRole("button", { name: "Predložene slike" }).click();
    const gallery = page.getByRole("dialog", { name: "Predložene slike" });
    await expect(gallery.getByRole("button", { name: "Odaberi sliku" })).toBeDisabled();
    await gallery.getByRole("button", { name: "Predložena slika 2" }).click();
    await gallery.getByRole("button", { name: "Odaberi sliku" }).click();
    await expect(gallery).toBeHidden();
    await page.getByRole("button", { name: "Sačuvaj izmjene" }).click();
    await expect(toast(page, "Proizvod je uspješno ažuriran.")).toBeVisible();

    const updated = await productCard(page, name);
    await expect(updated.getByRole("img", { name })).toHaveAttribute("src", /images\.unsplash\.com/);
  });
});

test("a product without an image shows the generic product image", async ({ page }) => {
  const name = uniqueName("E2E Bez slike");
  const api = await apiAs("store");
  await createProduct(api, { name, category: "Fish" });
  await api.dispose();

  const card = await productCard(page, name);
  await expect(card.getByRole("img", { name })).toHaveAttribute("src", /^data:image\/svg\+xml|product-placeholder/);
});
