import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, runId, storageState } from "../support/accounts.js";
import { dialogWith, changeTemporaryPassword, fillProductForm, loginViaForm, toast } from "../support/ui.js";

test("a chain's branch in Breza publishes a product that a restaurant in Visoko sees with the chain label", async ({
  browser,
}) => {
  test.slow();
  const id = runId();
  const company = `E2E Lanac ${id}`;
  const branch = `E2E Poslovnica ${id}`;
  const productName = `E2E Burek ${id}`;
  const hq = { email: `e2e-hq-${id}@foodwise.test`, temporaryPassword: `Privremena-hq-${id}` };
  const branchLogin = { email: `e2e-branch-${id}@foodwise.test`, temporaryPassword: `Privremena-br-${id}` };

  const adminContext = await browser.newContext({ storageState: storageState("admin") });
  const hqContext = await browser.newContext();
  const branchContext = await browser.newContext();
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const admin = await adminContext.newPage();
  const hqPage = await hqContext.newPage();
  const branchPage = await branchContext.newPage();
  const restaurant = await restaurantContext.newPage();
  const gate = (page: Page) => page.getByRole("dialog", { name: "Dovršite podešavanje naloga" });

  await test.step("Admin kreira firmu s pristupom za centralu", async () => {
    await admin.goto("/admin/companies/new");
    await admin.getByLabel("Naziv firme").fill(company);
    await admin.getByLabel("Email centrale").fill(hq.email);
    await admin.getByLabel("Privremena lozinka").fill(hq.temporaryPassword);
    await admin.getByRole("button", { name: "Kreiraj firmu" }).click();
    await expect(toast(admin, "Firma je kreirana.")).toBeVisible();
    await expect(admin.getByRole("heading", { level: 1, name: company })).toBeVisible();
  });

  await test.step("Centrala se prijavljuje, mijenja lozinku i popunjava profil", async () => {
    await loginViaForm(hqPage, hq.email, hq.temporaryPassword);
    await expect(gate(hqPage).getByText(/Popunite obavezne podatke: Ime, Prezime, Telefon\./)).toBeVisible();
    await changeTemporaryPassword(hqPage, hq.temporaryPassword, PASSWORD);
    // The form is filled from GET /users/me when the page opens; wait for it before typing.
    await expect(hqPage.getByLabel("Email")).toHaveValue(hq.email);
    await hqPage.getByLabel("Ime", { exact: true }).fill("Centrala");
    await hqPage.getByLabel("Prezime").fill("Lanac");
    await hqPage.getByLabel("Telefon").fill("061 333 444");
    await hqPage.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(toast(hqPage, "Profil uspješno ažuriran.")).toBeVisible();
    await hqPage.goto("/dashboard");
    await expect(gate(hqPage)).toBeHidden();
  });

  await test.step("Centrala otvara poslovnicu u Brezi i traži plan za nju", async () => {
    await hqPage.goto("/company/branches/new");
    await hqPage.getByLabel("Naziv poslovnice").fill(branch);
    const city = hqPage.getByLabel("Grad");
    await expect(city.getByRole("option", { name: "Breza" })).toBeAttached();
    await city.selectOption({ label: "Breza" });
    await hqPage.getByLabel("Telefon").fill("032 111 222");
    await hqPage.getByLabel("Adresa").fill("Bosanska 1");
    await hqPage.getByLabel("Email za prijavu").fill(branchLogin.email);
    await hqPage.getByLabel("Privremena lozinka").fill(branchLogin.temporaryPassword);
    await hqPage.getByRole("button", { name: "Kreiraj poslovnicu" }).click();
    await expect(toast(hqPage, "Poslovnica je uspješno kreirana.")).toBeVisible();
    await expect(hqPage.getByRole("heading", { level: 1, name: branch })).toBeVisible();

    await hqPage.getByRole("button", { name: "Izaberi paket" }).click();
    await hqPage
      .getByRole("dialog", { name: new RegExp(`^Paket za ${branch}`) })
      .getByRole("button", { name: /^Standard/ })
      .click();
    await dialogWith(hqPage, `Pretplata za ${branch}: Standard`).getByRole("button", { name: "Pošalji zahtjev" }).click();
    await expect(toast(hqPage, "Zahtjev je poslan. Administrator će ga uskoro pregledati.")).toBeVisible();
  });

  await test.step("Admin odobrava plan poslovnice", async () => {
    await admin.goto("/admin/credit-requests");
    const row = admin.getByRole("row").filter({ hasText: branch });
    await expect(row.getByText("Na čekanju")).toBeVisible();
    await row.getByRole("button", { name: "Odobri" }).click();
    await dialogWith(admin, "Odobriti zahtjev?").getByRole("button", { name: "Odobri" }).click();
    await expect(toast(admin, "Zahtjev je odobren.")).toBeVisible();
  });

  await test.step("Poslovnica se prijavljuje; naziv i grad mijenja samo centrala", async () => {
    await loginViaForm(branchPage, branchLogin.email, branchLogin.temporaryPassword);
    await expect(gate(branchPage).getByText(/Popunite obavezne podatke: Ime, Prezime\./)).toBeVisible();
    await changeTemporaryPassword(branchPage, branchLogin.temporaryPassword, PASSWORD);
    await expect(branchPage.getByLabel("Email")).toHaveValue(branchLogin.email);
    await expect(branchPage.getByLabel("Naziv biznisa")).toHaveValue(branch);
    await expect(branchPage.getByLabel("Naziv biznisa")).toBeDisabled();
    await expect(branchPage.getByLabel("Grad")).toBeDisabled();
    await expect(branchPage.getByText("Mijenja centrala")).toHaveCount(2);
    await branchPage.getByLabel("Ime", { exact: true }).fill("Poslovnica");
    await branchPage.getByLabel("Prezime").fill("Breza");
    await branchPage.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(toast(branchPage, "Profil uspješno ažuriran.")).toBeVisible();
  });

  await test.step("Poslovnica objavljuje proizvod", async () => {
    await branchPage.goto("/add-product");
    await expect(gate(branchPage)).toBeHidden();
    await fillProductForm(branchPage, productName);
    await branchPage.getByRole("button", { name: "Dodaj proizvod" }).click();
    await expect(toast(branchPage, "Proizvod uspješno kreiran.")).toBeVisible();
  });

  await test.step("Restoran u Visokom vidi proizvod s oznakom lanca", async () => {
    await restaurant.goto("/browse-products");
    await restaurant.getByPlaceholder("Pretraga po imenu").fill(productName);
    const card = restaurant
      .getByTestId("product-card")
      .filter({ has: restaurant.getByRole("heading", { name: productName }) });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(branch)).toBeVisible();
    await expect(card.getByText(`dio ${company}`)).toBeVisible();
    await expect(card.getByText("Breza · 7 km")).toBeVisible();
  });

  for (const context of [adminContext, hqContext, branchContext, restaurantContext]) await context.close();
});
