import { expect, test, type Locator, type Page } from "@playwright/test";
import { runId, storageState, type SeededRole } from "../support/accounts.js";
import { apiAs, createDonation, createProduct, createStoreWithoutPlan, myId, requestSubscription, sendOrder } from "../support/api.js";

// Phone width: every store and restaurant page fits the screen, with the bottom bar instead of the
// sidebar (docs/mobile-review.md, the navigation shell).
// 375 px by default; MOBILE_WIDTH=390 runs the same checks on a wider phone (docs/e2e.md).
const WIDTH = Number(process.env.MOBILE_WIDTH ?? 375);
test.use({ viewport: { width: WIDTH, height: 812 }, hasTouch: true });

// Only stores have a Credits page: restaurants pay no credits.
const STORE_PAGES = ["/dashboard", "/my-products", "/add-product", "/import-products", "/orders", "/credits"];
const RESTAURANT_PAGES = ["/dashboard", "/browse-products", "/stores", "/my-orders"];
const SHARED_PAGES = ["/pickups", "/reports", "/my-profile", "/donate-food", "/donate-food/new", "/sponsor", "/notifications"];

const bottomBar = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });

const expectPhoneLayout = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(bottomBar(page), path).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Meni" }), path).toBeHidden();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
};

// iOS zooms into a focused field whose text is under 16 px; every visible text field on the page
// must be at least that large.
const expectNoSmallFieldText = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")]
      .filter((field) => !["checkbox", "radio", "file", "hidden"].includes(field.type))
      .filter((field) => field.getBoundingClientRect().width > 0 && getComputedStyle(field).visibility !== "hidden")
      .filter((field) => parseFloat(getComputedStyle(field).fontSize) < 16)
      .map((field) => `${field.tagName.toLowerCase()} "${field.getAttribute("placeholder") ?? field.getAttribute("aria-label") ?? field.name}" ${getComputedStyle(field).fontSize}`),
  );
  expect(small, `${path}: fields under 16 px`).toEqual([]);
};

// Every visible button, link, tab and form field inside `scope` is at least 44 px high (a finger's
// tap target).
const expectTapTargets = async (scope: Locator, label: string) => {
  await expect(scope.first(), label).toBeVisible();
  const small = await scope.evaluateAll((roots) =>
    roots
      .flatMap((root) => {
        const selector = "button, a, [role=tab], select, input:not([type=checkbox]):not([type=radio])";
        return [root, ...root.querySelectorAll<HTMLElement>(selector)].filter((element) => element.matches(selector));
      })
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => element.getBoundingClientRect().height < 44)
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent?.trim() || element.getAttribute("aria-label") || "").slice(0, 30)}" ${Math.round(element.getBoundingClientRect().height)} px`),
  );
  expect(small, `${label}: tap targets under 44 px`).toEqual([]);
};

// The dashboard's stat cards sit two to a row on a phone; every label is shown whole (it wraps
// instead of ending in "…").
const expectStatLabelsWhole = async (page: Page) => {
  await page.goto("/dashboard");
  const labels = page.getByTestId("stat-label");
  await expect(labels.first()).toBeVisible();
  const cut = await labels.evaluateAll((all) =>
    all.filter((label) => label.scrollWidth > label.clientWidth || getComputedStyle(label).textOverflow === "ellipsis").map((label) => label.textContent),
  );
  expect(cut, "stat labels cut off").toEqual([]);
};

// Below sm the search stays on screen and the other filters wait behind the Filters button; the
// panel opens under the bar, counts what is set and closes with the results button.
const expectFilterPanel = async (page: Page, path: string, search: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const bar = page.getByTestId("filter-bar");
  const category = bar.getByRole("combobox").filter({ has: page.locator('option[value="Dairy"]') });
  await expect(bar.getByPlaceholder(search), path).toBeVisible();
  await expect(category, path).toBeHidden();
  const button = bar.getByRole("button", { name: /^Filteri/ });
  await expect(button, path).toHaveAttribute("aria-expanded", "false");
  // The closed bar is one row: the search and the button side by side.
  expect((await bar.boundingBox())!.height, path).toBeLessThan(90);

  await button.click();
  await expect(category, path).toBeVisible();
  await category.selectOption("Dairy");
  await expect(button, path).toHaveAccessibleName(/^Filteri\s*1$/);
  await expectTapTargets(bar, path);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(WIDTH);

  await bar.getByRole("button", { name: /^Prikaži \d+ rezultat/ }).click();
  await expect(category, path).toBeHidden();
  await expect(button, path).toHaveAttribute("aria-expanded", "false");

  // Clear filters in the panel resets the category and the count.
  await button.click();
  await bar.getByRole("button", { name: "Očisti filtere" }).click();
  await expect(category, path).toHaveValue("");
  await expect(button, path).toHaveAccessibleName(/^Filteri$/);
};

let productId: number;
let orderId: number;
let storeId: number;
let restaurantId: number;
const donationIds: Partial<Record<SeededRole, number>> = {};

test.beforeAll(async () => {
  const storeApi = await apiAs("store");
  const restaurantApi = await apiAs("restaurant");
  productId = (await createProduct(storeApi, { name: `E2E Mobilni ${runId()}` })).id;
  storeId = await myId(storeApi);
  restaurantId = await myId(restaurantApi);
  orderId = (await sendOrder(restaurantApi, productId, 1)).id;
  donationIds.store = (await createDonation(storeApi, `E2E Mobilna donacija ${runId()}`)).id;
  donationIds.restaurant = (await createDonation(restaurantApi, `E2E Mobilni obrok ${runId()}`)).id;
  await storeApi.dispose();
  await restaurantApi.dispose();
});

test.describe("store", () => {
  test.use({ storageState: storageState("store") });

  test("every page fits a phone screen", async ({ page }) => {
    const details = [`/products/${productId}`, `/edit-product/${productId}`, `/orders/${orderId}`, `/donate-food/${donationIds.store}/edit`];
    for (const path of [...STORE_PAGES, ...SHARED_PAGES, ...details]) await expectPhoneLayout(page, path);
  });

  test("My products keeps the search and puts the other filters behind the Filters button", async ({ page }) => {
    await expectFilterPanel(page, "/my-products", "Pretraga po imenu");
  });

  test("stat labels are not cut, and tabs, chips, report presets and footer links are 44 px", async ({ page }) => {
    await expectStatLabelsWhole(page);
    await expectTapTargets(page.getByRole("navigation", { name: "Podnožje" }), "footer");

    // The three Pickups tabs share one row.
    await page.goto("/pickups");
    const tabs = page.getByRole("tablist").getByRole("tab");
    await expect(tabs).toHaveCount(3);
    const tops = await tabs.evaluateAll((all) => all.map((tab) => Math.round(tab.getBoundingClientRect().top)));
    expect(new Set(tops).size, "Pickups tabs on one row").toBe(1);
    await expectTapTargets(page.getByRole("tablist"), "/pickups tabs");

    await page.goto("/reports");
    await expectTapTargets(page.locator("button[aria-pressed]"), "/reports presets");
    await page.goto("/credits");
    await expectTapTargets(page.getByRole("tablist"), "/credits tabs");
    await page.goto("/add-product");
    for (const name of ["Danas", "Sutra"]) {
      await expectTapTargets(page.getByRole("button", { name, exact: true }), `/add-product ${name}`);
    }
  });

  test("Add product starts with the templates collapsed into one row and the form on the first screen", async ({ page }) => {
    // Six templates, the number the review saw push the form to the third screen (saved by name,
    // so a rerun updates them).
    const storeApi = await apiAs("store");
    for (let i = 1; i <= 6; i++) {
      const saved = await storeApi.post("/api/product-templates", {
        data: { name: `E2E Predložak ${i}`, category: "Dairy", unit: "kg", original_price: "2.00", discounted_price: "1.00", quantity: "10", shelf_life_days: 2 },
      });
      expect(saved.ok()).toBe(true);
    }
    await storeApi.dispose();

    await page.goto("/add-product");
    const toggle = page.getByRole("button", { name: /^Predlošci \(\d+\)/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /^E2E Predložak 1 / })).toBeHidden();
    await expect(page.getByLabel("Naziv proizvoda")).toBeInViewport();
    await expectTapTargets(toggle, "templates row");

    await toggle.click();
    const template = page.getByRole("button", { name: /^E2E Predložak 3 / });
    await expect(template).toBeVisible();
    await expectTapTargets(page.locator("section").filter({ has: toggle }), "templates list");

    // Applying one fills the form, collapses the list and names the template in the row.
    await template.click();
    await expect(page.getByLabel("Naziv proizvoda")).toHaveValue("E2E Predložak 3");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(template).toBeHidden();
    await expect(toggle).toContainText("Primijenjen: E2E Predložak 3");
  });

  test("form fields use at least 16 px text on My profile, Add product and New donation", async ({ page }) => {
    for (const path of ["/my-profile", "/add-product", "/donate-food/new"]) await expectNoSmallFieldText(page, path);
  });

  test("the notification panel fits the screen and closes on Escape", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifikacije" }).click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(WIDTH);
    expect(box.y + box.height).toBeLessThanOrEqual(812);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(WIDTH);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });
});

// Dialogs on a short phone (iPhone SE, 667 px): the title and the buttons are on screen as soon as
// the dialog opens, only the dialog body scrolls, and the page behind stays still.
test.describe("dialogs on a short phone (667 px)", () => {
  test.use({ viewport: { width: WIDTH, height: 667 } });

  const expectButtonsOnScreen = async (page: Page, dialog: Locator, buttons: string[]) => {
    const scrollBefore = await page.evaluate(() => window.scrollY);
    for (const name of buttons) {
      await expect(dialog.getByRole("button", { name, exact: true }), name).toBeInViewport({ ratio: 1 });
    }
    // The dialog fits the screen and the page underneath is locked, not scrolled.
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  };

  test.describe("restaurant", () => {
    test.use({ storageState: storageState("restaurant") });

    test("the order dialog shows its buttons, and Back closes it on the same page", async ({ page }) => {
      await page.goto(`/products/${productId}`);
      await page.getByRole("button", { name: "Naruči" }).click();
      const dialog = page.getByRole("dialog", { name: "Naruči" });
      await expectButtonsOnScreen(page, dialog, ["Otkaži", "Pošalji narudžbu"]);

      // The Android back button: the dialog closes and the page stays.
      await page.goBack();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
    });
  });

  test.describe("store without a plan", () => {
    // A fresh store each run, so the plans are offered right away (the seeded store has one).
    test.use({
      storageState: async ({}, use) => {
        await use((await createStoreWithoutPlan()).storageState);
      },
    });

    test("the subscribe dialog shows its buttons", async ({ page }) => {
      await page.goto("/my-profile#subscription");
      const standard = page.locator("#plan-options > div").filter({ has: page.getByText("Standard", { exact: true }) });
      await standard.getByRole("button", { name: "Odaberi" }).click();
      await expectButtonsOnScreen(page, page.getByRole("dialog", { name: "Pretplata: Standard" }), ["Odustani", "Pošalji zahtjev"]);
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: storageState("admin") });

    test("the confirm dialog with a reason shows its buttons", async ({ page }) => {
      await page.goto(`/admin/users/${restaurantId}`);
      await page.getByRole("button", { name: "Blokiraj nalog" }).click();
      const dialog = page.getByRole("dialog", { name: "Blokirati nalog?" });
      await dialog.getByLabel("Razlog").focus();
      await expectButtonsOnScreen(page, dialog, ["Odustani", "Blokiraj"]);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("the edit profile dialog scrolls to its last field, with the buttons in view", async ({ page }) => {
      await page.goto(`/admin/users/${storeId}`);
      await page.getByRole("button", { name: "Uredi profil" }).click();
      const dialog = page.getByRole("dialog", { name: "Uredi profil korisnika" });
      await expectButtonsOnScreen(page, dialog, ["Odustani", "Sačuvaj profil"]);

      // Taller than the screen: the body scrolls inside the dialog.
      const body = dialog.getByTestId("modal-body");
      const { scrollHeight, clientHeight } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      const lastField = dialog.getByLabel("Opis");
      await expect(lastField).not.toBeInViewport();
      await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(lastField).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("button", { name: "Sačuvaj profil" })).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("heading", { name: "Uredi profil korisnika" })).toBeInViewport({ ratio: 1 });
    });
  });
});

// No page wider than the screen, and every button and link of every card fully on screen (no
// sideways scrolling). Lists show cards below md, not their table.
const expectPhonePage = async (page: Page, path: string, { cards = false } = {}) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
  if (!cards) return;
  await expect(page.getByTestId("data-card").first(), path).toBeVisible();
  for (const table of await page.getByRole("table").all()) await expect(table, path).toBeHidden();
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="data-card"] :is(button, a)')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ text: element.textContent?.trim(), box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.left < 0 || box.right > window.innerWidth)
      .map(({ text, box }) => `${text} (${Math.round(box.left)}..${Math.round(box.right)})`),
  );
  expect(outside, `${path}: card actions off screen`).toEqual([]);
};

// The admin's lists are cards below md: nothing wider than the screen, and every row action
// (approve, reject, remove, cancel, end) reachable without scrolling sideways.
test.describe("admin", () => {
  test.use({ storageState: storageState("admin") });
  let businessName: string;
  let announcementId: number;
  let companyId: number;

  test.beforeAll(async () => {
    const account = await createStoreWithoutPlan();
    businessName = account.businessName;
    await requestSubscription(account.storageState);
    const admin = await apiAs("admin");
    // An active announcement, so the list has its End action; ended again after these tests.
    const created = await admin.post("/api/admin/announcements", {
      data: { audience: "STORE", title_bs: `E2E Mobilno obavještenje ${runId()}`, body_bs: "Provjera kartica na telefonu." },
    });
    announcementId = (await created.json()).announcement.id;
    const { companies } = await (await admin.get("/api/admin/companies", { params: { q: "E2E Lanac" } })).json();
    companyId = companies[0].id;
    await admin.dispose();
  });

  test.afterAll(async () => {
    const admin = await apiAs("admin");
    await admin.post(`/api/admin/announcements/${announcementId}/end`);
    await admin.dispose();
  });

  test("every admin list shows cards with all row actions on a phone screen", async ({ page }) => {
    for (const path of [
      "/admin/users",
      "/admin/products",
      "/admin/donations",
      "/admin/orders",
      "/admin/actions",
      "/admin/announcements",
      "/admin/companies",
      "/admin/credits",
      "/admin/credit-requests",
    ]) {
      await expectPhonePage(page, path, { cards: true });
    }
    await expect(page.getByRole("combobox", { name: "Sortiraj po" })).toHaveCount(0);
    await page.goto("/admin/credits");
    await expect(page.getByRole("combobox", { name: "Sortiraj po" })).toBeVisible();
  });

  test("pagination fits one row with 44 px buttons", async ({ page }) => {
    // More than one page of 20 users: the seed has fewer, so add accounts (the list shows them all).
    const admin = await apiAs("admin");
    for (let i = 0; i < 21; i++) {
      const created = await admin.post("/api/admin/users", {
        data: { role: "RESTAURANT", email: `e2e-page-${runId()}-${i}@foodwise.test`, password: "Privremena-123" },
      });
      expect(created.ok()).toBe(true);
    }
    await admin.dispose();
    await page.goto("/admin/users");
    const pagination = page.getByRole("navigation", { name: "Stranice" });
    await expect(pagination).toBeVisible();
    await expectTapTargets(pagination, "pagination");
    const buttons = pagination.getByRole("button").filter({ visible: true });
    const tops = await buttons.evaluateAll((all) => all.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(tops).size, "pagination buttons on one row").toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(WIDTH);
  });

  test("the admin's other pages fit a phone screen", async ({ page }) => {
    for (const path of ["/admin", "/admin/users/new", "/admin/companies/new", `/admin/users/${storeId}`, `/admin/companies/${companyId}`]) {
      await expectPhonePage(page, path);
    }
    // The branch list on a company and its deactivate buttons.
    const deactivate = page.getByRole("button", { name: "Deaktiviraj", exact: true }).first();
    await deactivate.scrollIntoViewIfNeeded();
    await expect(deactivate).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  test("the remove, cancel and end actions are full-width buttons on the cards", async ({ page }) => {
    for (const [path, name] of [
      ["/admin/products", "Ukloni"],
      ["/admin/donations", "Ukloni"],
      ["/admin/orders", "Otkaži"],
      ["/admin/announcements", "Završi"],
    ] as const) {
      await page.goto(path);
      const button = page.getByTestId("data-card").getByRole("button", { name, exact: true }).first();
      await button.scrollIntoViewIfNeeded();
      await expect(button, path).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height, path).toBeGreaterThanOrEqual(44);
    }
  });

  test("a pending request's approve and reject buttons are on screen without sideways scrolling", async ({ page }) => {
    await page.goto("/admin/credit-requests?status=PENDING");
    const card = page.getByTestId("data-card").filter({ hasText: businessName });
    for (const name of ["Odobri", "Odbij"]) {
      const button = card.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button, name).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(WIDTH);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await card.getByRole("button", { name: "Odobri", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Odobriti zahtjev?" })).toBeVisible();
  });
});

// The company headquarters' pages: the branch tables and the reports are cards below md.
test.describe("company headquarters", () => {
  test.use({ storageState: storageState("hq") });
  let branchId: number;

  test.beforeAll(async () => {
    const hq = await apiAs("hq");
    const { branches } = await (await hq.get("/api/company/branches")).json();
    branchId = branches[0].id;
    await hq.dispose();
  });

  test("the overview, credits and reports show cards with all actions on a phone screen", async ({ page }) => {
    for (const path of ["/dashboard", "/company/credits", "/company/reports"]) {
      await expectPhonePage(page, path, { cards: true });
    }
    // Choose plan and Add credits on the branch card.
    await page.goto("/company/credits");
    const card = page.getByTestId("data-card").first();
    for (const name of ["Izaberi paket", "Dodaj kredite"]) {
      const button = card.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button, name).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("the headquarters' other pages fit a phone screen", async ({ page }) => {
    for (const path of ["/company/branches", `/company/branches/${branchId}`, "/company/profile", "/my-profile", "/notifications"]) {
      await expectPhonePage(page, path);
    }
  });
});

test.describe("restaurant", () => {
  test.use({ storageState: storageState("restaurant") });

  test("every page fits a phone screen", async ({ page }) => {
    const details = [`/stores/${storeId}`, `/products/${productId}`, `/orders/${orderId}`, `/donate-food/${donationIds.restaurant}/edit`];
    for (const path of [...RESTAURANT_PAGES, ...SHARED_PAGES, ...details]) await expectPhoneLayout(page, path);
  });

  test("Browse products keeps the search and puts the other filters behind the Filters button", async ({ page }) => {
    await expectFilterPanel(page, "/browse-products", "Pretraga po imenu");
  });

  test("stat labels are not cut, and the order tabs are 44 px", async ({ page }) => {
    await expectStatLabelsWhole(page);
    await page.goto("/my-orders");
    await expectTapTargets(page.getByRole("tablist"), "/my-orders tabs");
  });

  test("the meal donation form uses at least 16 px text", async ({ page }) => {
    // A restaurant's form starts on meals, with the allergen and serving fields.
    await expectNoSmallFieldText(page, "/donate-food/new");
  });

  test("More opens the menu drawer and Escape closes it", async ({ page }) => {
    await page.goto("/dashboard");
    await bottomBar(page).getByRole("button", { name: "Više" }).click();
    const drawer = page.getByRole("dialog", { name: "Meni" });
    await expect(drawer.getByRole("link", { name: "Prodavnice" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
