import { expect, test, type Page } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { sarajevoDate } from "../support/dates.js";
import { availableCredits, expectAvailableCredits, toast } from "../support/ui.js";

test.use({ storageState: storageState("store") });

const HEADER = "name,description,category,original_price,discounted_price,quantity,unit,expiry_date";

// A CSV file for the import input, built from rows of [name, category, unit]. Expiry dates are
// relative to today (dd.mm.yyyy, the format the template uses).
const csvFile = (rows: [string, string, string][]) => {
  const expiry = sarajevoDate(4).replaceAll("/", ".");
  const lines = rows.map(([name, category, unit]) => `${name},,${category},4.00,2.00,6,${unit},${expiry}`);
  return { name: "proizvodi.csv", mimeType: "text/csv", buffer: Buffer.from([HEADER, ...lines].join("\n")) };
};

const myProducts = async (page: Page, prefix: string) => {
  await page.goto("/my-products");
  await page.getByPlaceholder("Pretraga po imenu").fill(prefix);
  return page.getByTestId("product-card").filter({ hasText: prefix });
};

test("a store imports products from a CSV, and a CSV with an invalid row imports nothing", async ({ page }) => {
  const id = runId();

  await test.step("Ispravan CSV: 3 proizvoda, 3 kredita", async () => {
    const prefix = `E2E Uvoz ${id}`;
    const before = await availableCredits(page);
    await page.goto("/import-products");
    await page.getByLabel("Odaberite CSV fajl").setInputFiles(
      csvFile([
        [`${prefix} Mlijeko`, "Dairy", "l"],
        [`${prefix} Hljeb`, "Bakery", "kom"],
        [`${prefix} Jabuke`, "Fruits", "kg"],
      ]),
    );
    await page.getByRole("button", { name: "Uvezi proizvode" }).click();
    const confirm = page.getByRole("dialog", { name: "Uvesti 3 proizvoda?" });
    await expect(confirm.getByText(`Ovo troši 3 kredita (preostalo: ${before}).`)).toBeVisible();
    await confirm.getByRole("button", { name: "Uvezi 3 proizvoda" }).click();
    await expect(toast(page, "Uvezena su 3 proizvoda.")).toBeVisible();
    await expect(page).toHaveURL(/\/my-products$/);

    const cards = await myProducts(page, prefix);
    await expect(cards).toHaveCount(3);
    for (const name of ["Mlijeko", "Hljeb", "Jabuke"]) {
      await expect(cards.getByRole("heading", { name: `${prefix} ${name}` })).toBeVisible();
    }
    await expectAvailableCredits(page, before - 3);
  });

  await test.step("CSV s neispravnim redom: greške po redovima, ništa se ne uvozi", async () => {
    const prefix = `E2E Neispravan ${id}`;
    const before = await availableCredits(page);
    await page.goto("/import-products");
    // Row 1 is the header, so the second product is row 3.
    await page.getByLabel("Odaberite CSV fajl").setInputFiles(
      csvFile([
        [`${prefix} Sir`, "Dairy", "kg"],
        [`${prefix} Kobasica`, "Meso", "kg"],
        [`${prefix} Sok`, "Drinks", "l"],
      ]),
    );
    await page.getByRole("button", { name: "Uvezi proizvode" }).click();
    await expect(toast(page, "CSV sadrži neispravne redove.")).toBeVisible();
    const errorRow = page.getByRole("row").filter({ hasText: "Kategorija nije ispravna." });
    await expect(errorRow).toHaveCount(1);
    await expect(errorRow.getByRole("cell").first()).toHaveText("3");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto("/my-products");
    await page.getByPlaceholder("Pretraga po imenu").fill(prefix);
    await expect(page.getByText("Nema rezultata", { exact: true })).toBeVisible();
    await expectAvailableCredits(page, before);
  });
});
