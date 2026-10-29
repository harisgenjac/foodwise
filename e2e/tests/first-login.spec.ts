import { expect, test } from "@playwright/test";
import { ACCOUNTS, runId, storageState } from "../support/accounts.js";

test.use({ storageState: storageState("admin") });

test("a new restaurant changes its temporary password and fills in its profile before using the app", async ({ page }) => {
  const id = runId();
  const email = `e2e-rest-${id}@foodwise.test`;
  const temporaryPassword = `Privremena-${id}`;
  const newPassword = `Nova-lozinka-${id}`;
  const firstName = `Amra${id}`;
  const gate = page.getByRole("dialog", { name: "Dovršite podešavanje naloga" });
  const toast = (text: string) => page.getByRole("status").filter({ hasText: text });

  // The admin creates the restaurant account.
  await page.goto("/admin/users/new");
  await page.getByRole("radio", { name: "Restoran" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Lozinka").fill(temporaryPassword);
  await page.getByRole("button", { name: "Kreiraj nalog" }).click();
  await expect(toast("Nalog je kreiran.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: email })).toBeVisible();
  await expect(page.getByText("Čeka promjenu lozinke")).toBeVisible();

  // Log out.
  const admin = ACCOUNTS.admin;
  await page.locator("header").getByRole("button", { name: `${admin.firstName} ${admin.lastName}` }).click();
  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Log in with the temporary password: the app is locked behind the setup gate.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Lozinka").fill(temporaryPassword);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(gate).toBeVisible();
  await expect(gate.getByText("Postavite svoju lozinku umjesto privremene")).toBeVisible();

  // The forced password change.
  await gate.getByRole("link", { name: "Idi na Moj profil" }).click();
  await expect(page).toHaveURL(/\/my-profile$/);
  await page.getByLabel("Trenutna lozinka").fill(temporaryPassword);
  await page.getByLabel("Nova lozinka", { exact: true }).fill(newPassword);
  await page.getByLabel("Ponovite novu lozinku").fill(newPassword);
  await page.getByRole("button", { name: "Promijeni lozinku" }).click();
  await expect(toast("Lozinka je promijenjena.")).toBeVisible();

  // The profile gate still blocks the app until the required fields are saved.
  await expect(page.getByText(/Popunite obavezne podatke: Ime, Prezime/)).toBeVisible();
  await page.goto("/dashboard");
  await expect(gate).toBeVisible();
  await expect(gate.getByText(/Popunite obavezne podatke/)).toBeVisible();
  await gate.getByRole("link", { name: "Idi na Moj profil" }).click();

  // The page fills the form from GET /users/me when it opens; typing before that answer arrives
  // gets overwritten. The read-only Email field is filled only by that answer.
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Ime", { exact: true }).fill(firstName);
  await page.getByLabel("Prezime").fill("Testić");
  await page.getByLabel("Naziv biznisa").fill(`E2E Restoran ${id}`);
  const city = page.getByLabel("Grad");
  await expect(city.getByRole("option", { name: "Visoko" })).toBeAttached();
  await city.selectOption({ label: "Visoko" });
  await page.getByLabel("Telefon").fill("061 111 222");
  await page.getByLabel("Adresa").fill("Musala 5");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(toast("Profil uspješno ažuriran.")).toBeVisible();

  // The dashboard is usable.
  await page.locator("aside").getByRole("link", { name: "Početna" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Dobro došli, ${firstName}` })).toBeVisible();
  await expect(gate).toBeHidden();
  // The hero button; an empty dashboard repeats the same link further down.
  await page.getByRole("main").getByRole("link", { name: "Pretraži ponude" }).first().click();
  await expect(page).toHaveURL(/\/browse-products$/);
  await expect(page.getByRole("heading", { level: 1, name: "Proizvodi" })).toBeVisible();
});
