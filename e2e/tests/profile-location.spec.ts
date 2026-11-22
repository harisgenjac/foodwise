import { expect, test, type Page } from "@playwright/test";
import { storageState, type SeededRole } from "../support/accounts.js";
import { setPinAs } from "../support/api.js";
import { open, openProfileSection, reload, saveProfile, toast } from "../support/ui.js";

// A store sets its location with a pin on the map on My profile: the dashboard reminds it while
// the pin is missing and links to the map; a click on the map sets the pin, saving keeps it.
// Runs on desktop Chrome and on the iPhone project, each with its own store so the two runs never
// share a profile (neither pin matters to the specs that use these stores).
const accountFor = (projectName: string): SeededRole => (projectName === "webkit-iphone" ? "brezaStore" : "tuzlaStore");

test.use({
  storageState: async ({}, use, testInfo) => use(storageState(accountFor(testInfo.project.name))),
});

// The map tiles come from OpenStreetMap; the test answers them with a blank tile instead of
// calling their servers (the map works the same without the picture).
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: BLANK_PNG }),
  );
});

// Clears the pin again after the test, also when it fails.
test.afterEach(async ({}, testInfo) => {
  await setPinAs(accountFor(testInfo.project.name), null);
});

const map = (page: Page) => page.getByRole("application", { name: "Mapa za označavanje lokacije" });

test("a store sets its location with a pin on the map", async ({ page }) => {
  await test.step("Dashboard podsjeća i vodi na mapu", async () => {
    await open(page, "/dashboard");
    await expect(page.getByText("Označite lokaciju vašeg objekta na mapi, bit će potrebna za dostavu.")).toBeVisible();
    await page.getByRole("link", { name: "Označi lokaciju" }).click();
    await expect(page).toHaveURL(/\/my-profile#location$/);
    await expect(page.getByText("Lokacija još nije označena. Bit će potrebna za dostavu.")).toBeVisible();
    await expect(map(page)).toBeInViewport();
  });

  await test.step("Klik na mapu postavlja pin, čuvanje ga sprema", async () => {
    // The map starts at the store's city centre, so its middle is well inside the 30 km limit.
    await map(page).click();
    await expect(page.getByText("Lokacija još nije označena. Bit će potrebna za dostavu.")).toBeHidden();
    await expect(page.getByTitle("Vaša lokacija (povucite za pomjeranje)")).toBeVisible();
    await saveProfile(page);
  });

  await test.step("Pomjeranje postavljenog pina traži potvrdu, Odustani ga ostavlja", async () => {
    await map(page).scrollIntoViewIfNeeded();
    const box = (await map(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4);
    const dialog = page.getByRole("dialog", { name: "Promijeniti lokaciju?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Odustani" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTitle("Vaša lokacija (povucite za pomjeranje)")).toBeVisible();
  });

  await test.step("Pin ostaje nakon osvježavanja, a podsjetnik nestaje", async () => {
    await reload(page);
    await openProfileSection(page, /Lokacija/);
    await expect(page.getByTitle("Vaša lokacija (povucite za pomjeranje)")).toBeVisible();
    await open(page, "/dashboard");
    await expect(page.getByRole("link", { name: "Označi lokaciju" })).toHaveCount(0);
  });
});
