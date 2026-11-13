import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, API_URL, runId, storageState } from "../support/accounts.js";
import { apiAs, createProduct, recordShopSale, setProductPrice } from "../support/api.js";
import { addToCart, checkout, emptyCart, sentOrderCode, toast } from "../support/ui.js";

// The restaurant's cart (docs/orders-design.md, sections 4 and 5): one store per cart, the flags of
// lines whose offer changed, and what sending does with them with partial fulfilment on and off.
// The seeded restaurant is shared by the specs, so each test starts and ends with an empty cart
// and cancels the orders it sent (they would count towards the pending-order limit).

const cartLine = (page: Page, name: string) => page.getByTestId("cart-line").filter({ hasText: name });

// The id of the order on the confirmation, from its "Pogledaj narudžbu" link.
const sentOrderId = async (page: Page) => {
  await sentOrderCode(page);
  const href = await page.getByRole("link", { name: "Pogledaj narudžbu" }).getAttribute("href");
  return Number(/\/orders\/(\d+)$/.exec(href ?? "")![1]);
};

test.describe("cart", () => {
  let restaurant: Page;
  const sentOrders: number[] = [];

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageState("restaurant") });
    restaurant = await context.newPage();
    await emptyCart(restaurant);
  });

  test.afterEach(async () => {
    await emptyCart(restaurant);
    for (const orderId of sentOrders.splice(0)) await restaurant.request.post(`${API_URL}/api/orders/${orderId}/cancel`);
    await restaurant.context().close();
  });

  test("holds one store: another store's product asks to empty the cart first", async () => {
    const id = runId();
    const mine = `E2E Kajmak ${id}`;
    const theirs = `E2E Sir Breza ${id}`;
    const storeApi = await apiAs("store");
    await createProduct(storeApi, { name: mine });
    await storeApi.dispose();
    const brezaApi = await apiAs("brezaStore");
    await createProduct(brezaApi, { name: theirs });
    await brezaApi.dispose();

    await addToCart(restaurant, mine, "2");
    await expect(restaurant.getByRole("link", { name: "Korpa, 1 proizvod" })).toBeVisible();

    const card = restaurant.getByTestId("product-card").filter({ hasText: theirs });
    await restaurant.goto("/browse-products");
    await restaurant.getByPlaceholder("Pretraga po imenu").fill(theirs);
    await card.getByRole("button", { name: "Dodaj u korpu" }).click();
    const dialog = restaurant.getByRole("dialog", { name: "Dodaj u korpu" });
    await dialog.getByLabel("Količina").fill("1");
    await dialog.getByRole("button", { name: "Dodaj u korpu" }).click();

    const question = restaurant.getByRole("dialog", { name: "Isprazniti korpu?" });
    await expect(
      question.getByText(`U korpi su proizvodi iz ${ACCOUNTS.store.businessName}. Narudžba može biti samo iz jedne prodavnice.`),
    ).toBeVisible();
    await question.getByRole("button", { name: "Isprazni i dodaj" }).click();
    await expect(toast(restaurant, `${theirs}: dodano u korpu.`)).toBeVisible();

    await restaurant.getByRole("link", { name: "Korpa, 1 proizvod" }).click();
    await expect(restaurant.getByRole("link", { name: ACCOUNTS.brezaStore.businessName })).toBeVisible();
    await expect(cartLine(restaurant, theirs)).toBeVisible();
    await expect(cartLine(restaurant, mine)).toHaveCount(0);
  });

  test("with partial fulfilment on, sends what it can and keeps the rest in the cart", async () => {
    const id = runId();
    const chicken = `E2E Piletina ${id}`;
    const milk = `E2E Mlijeko ${id}`;
    const cheese = `E2E Sir ${id}`;
    const storeApi = await apiAs("store");
    const chickenProduct = await createProduct(storeApi, { name: chicken, quantity: 10 });
    const milkProduct = await createProduct(storeApi, { name: milk, quantity: 5 });
    const cheeseProduct = await createProduct(storeApi, { name: cheese, quantity: 5, discounted_price: 3 });

    await addToCart(restaurant, chicken, "4");
    await addToCart(restaurant, milk, "2");
    await addToCart(restaurant, cheese, "1");

    // The cheese gets more expensive before the cart is opened: the cart shows it.
    await setProductPrice(storeApi, cheeseProduct.id, 3.5);
    await restaurant.goto("/cart");
    await expect(cartLine(restaurant, cheese).getByText("Cijena je porasla na 3.50 KM (bila je 3.00 KM).", { exact: false })).toBeVisible();

    // While the cart is open, the store sells in its shop: chicken down to 2 kg, the milk sold out.
    await recordShopSale(storeApi, chickenProduct.id, 8);
    await recordShopSale(storeApi, milkProduct.id, 5);
    await storeApi.dispose();

    await checkout(restaurant, { acceptPartial: true });
    sentOrders.push(await sentOrderId(restaurant));
    await expect(restaurant.getByText("Iznos 4.00 KM.", { exact: false })).toBeVisible();
    await expect(restaurant.getByText(`${chicken}: 2 kg umjesto 4 kg, nema više na stanju`)).toBeVisible();
    await expect(restaurant.getByText(`${milk} nije poslan: rasprodano`)).toBeVisible();
    await expect(restaurant.getByText(`${cheese} nije poslan: cijena je porasla na 3.50 KM`)).toBeVisible();

    // The lines that were not sent wait in the cart with their flag.
    await restaurant.getByRole("button", { name: "Nazad u korpu" }).click();
    await expect(restaurant.getByTestId("cart-line")).toHaveCount(2);
    await expect(cartLine(restaurant, milk).getByText("Više nije dostupno")).toBeVisible();
    await cartLine(restaurant, cheese).getByRole("button", { name: "Prihvati novu cijenu" }).click();
    await expect(cartLine(restaurant, cheese).getByText("Cijena je porasla", { exact: false })).toHaveCount(0);
    await restaurant.getByRole("button", { name: "Ukloni nedostupne" }).click();
    await expect(restaurant.getByTestId("cart-line")).toHaveCount(1);
  });

  test("with partial fulfilment off, sends nothing until the marked line is fixed", async () => {
    const bread = `E2E Hljeb ${runId()}`;
    const storeApi = await apiAs("store");
    const breadProduct = await createProduct(storeApi, { name: bread, quantity: 5 });

    await addToCart(restaurant, bread, "5");
    await restaurant.goto("/cart");
    await expect(cartLine(restaurant, bread)).toBeVisible();
    await recordShopSale(storeApi, breadProduct.id, 2);
    await storeApi.dispose();

    await checkout(restaurant, { acceptPartial: false });
    await expect(toast(restaurant, "Narudžba nije poslana. Ispravite označene stavke ili prihvatite djelimičnu isporuku.")).toBeVisible();
    const line = cartLine(restaurant, bread);
    await expect(line.getByText("Zbog ove stavke narudžba nije poslana.")).toBeVisible();
    await expect(line.getByText("Dostupno još samo 3 kg.")).toBeVisible();

    await line.getByRole("button", { name: "Smanji na 3 kg" }).click();
    await expect(line.getByText("Dostupno još samo", { exact: false })).toHaveCount(0);
    await restaurant.getByRole("button", { name: "Pošalji narudžbu" }).click();
    sentOrders.push(await sentOrderId(restaurant));
    await expect(restaurant.getByText("Iznos 6.00 KM.", { exact: false })).toBeVisible();
    await expect(restaurant.getByRole("link", { name: "Korpa", exact: true })).toBeVisible();
  });
});
