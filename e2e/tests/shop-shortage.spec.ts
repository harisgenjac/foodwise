import { expect, test, type Page } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { apiAs, createProduct, sendOrder, sendOrderOf } from "../support/api.js";
import { toast } from "../support/ui.js";

// The till sells food that a pending order holds: 10 kg of apples, an order of 6 kg, 8 kg sold at
// the till, so only 2 kg is left. "Prodano u radnji" takes all 8 kg (4 kg free at once, 4 kg the
// order must give up) and the decision cannot accept more than 2 kg.

// The store records `amount` as sold in its shop on the product page and confirms it.
const sellInShop = async (store: Page, productId: number, amount: string) => {
  await store.goto(`/products/${productId}`);
  await store.getByRole("button", { name: "Prodano u radnji" }).click();
  const dialog = store.getByRole("dialog", { name: "Prodano u vašoj radnji" });
  await dialog.getByLabel("Količina prodana u radnji").fill(amount);
  await dialog.getByRole("button", { name: "Nastavi" }).click();
  await expect(
    dialog.getByText("Odmah se upisuje 4 kilogram (kg). Preostalih 4 kilogram (kg) je u narudžbama na čekanju", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Upiši prodaju" }).click();
  return store.getByRole("dialog", { name: "Narudžbe treba smanjiti" });
};

test("the store sold part of an order at its till: it can accept only what is left", async ({ browser }) => {
  const apples = `E2E Jabuke ${runId()}`;
  const storeApi = await apiAs("store");
  const product = await createProduct(storeApi, { name: apples, quantity: 10 });
  await storeApi.dispose();
  const restaurantApi = await apiAs("restaurant");
  const order = await sendOrderOf(restaurantApi, [{ productId: product.id, quantity: 6, unitPrice: 2 }]);
  await restaurantApi.dispose();
  const code = `#${order.code}`;

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Prodavnica upisuje 8 kg prodanih u radnji i vidi narudžbu koju treba smanjiti", async () => {
    const shortage = await sellInShop(store, product.id, "8");
    await expect(shortage.getByText(`${apples}: u radnji ste prodali 4 kilogram (kg)`, { exact: false })).toBeVisible();
    await shortage.getByRole("link", { name: new RegExp(`^Narudžba ${code} · `) }).click();
    await expect(store).toHaveURL(new RegExp(`/orders/${order.id}$`));
  });

  await test.step("Prihvatiti svih 6 kg ne može: poruka, pa prihvata 2 kg", async () => {
    await store.getByRole("button", { name: "Odluči" }).click();
    const dialog = store.getByRole("dialog", { name: `Odluka o narudžbi ${code}` });
    const line = dialog.getByTestId("decision-line").filter({ hasText: apples });
    await expect(line.getByTestId("shortage-note")).toHaveText(
      "U vašoj radnji je prodano više nego što je bilo slobodno: možete prihvatiti najviše 2 kg.",
    );
    await expect(line.getByLabel(`Prihvaćena količina: ${apples}`)).toHaveValue("2");

    await line.getByRole("radio", { name: "Prihvati sve" }).click();
    await dialog.getByRole("button", { name: "Potvrdi odluku" }).click();
    await expect(
      toast(store, `${apples}: nakon prodaje u radnji možete prihvatiti najviše 2 kg. Prihvatite manje ili odbijte.`),
    ).toBeVisible();

    await line.getByRole("radio", { name: "Prihvati manje" }).click();
    await expect(line.getByLabel("Razlog")).toHaveValue("NOT_ENOUGH_STOCK");
    await dialog.getByRole("button", { name: "Potvrdi odluku" }).click();
    await dialog.getByRole("button", { name: "Sačuvaj odluku" }).click();
    await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();
  });

  await test.step("Restoran dobija 2 kg, a jabuke više nisu u ponudi", async () => {
    await restaurant.goto(`/orders/${order.id}`);
    await expect(restaurant.getByText("Djelimično prihvaćena")).toBeVisible();
    const row = restaurant.getByTestId("order-item").filter({ hasText: apples });
    await expect(row.getByText("2 kg")).toBeVisible();
    await expect(row.getByText("Nema dovoljno na stanju")).toBeVisible();
    // 2 kg accepted + 8 kg sold in the shop: sold out.
    await store.goto(`/products/${product.id}`);
    await expect(store.getByText("Prodano", { exact: true }).first()).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});

test("without partial fulfilment, an order the till sold part of must be rejected", async ({ browser }) => {
  const apples = `E2E Jabuke cijele ${runId()}`;
  const storeApi = await apiAs("store");
  const product = await createProduct(storeApi, { name: apples, quantity: 10 });
  await storeApi.dispose();
  const restaurantApi = await apiAs("restaurant");
  // sendOrder sends with partial fulfilment off.
  const order = await sendOrder(restaurantApi, product.id, 6);
  await restaurantApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const store = await storeContext.newPage();
  await (await sellInShop(store, product.id, "8")).getByRole("button", { name: "Zatvori" }).click();

  await store.goto(`/orders/${order.id}`);
  await store.getByRole("button", { name: "Odluči" }).click();
  const dialog = store.getByRole("dialog", { name: `Odluka o narudžbi #${order.code}` });
  await expect(
    dialog.getByText("Restoran prihvata samo cijelu narudžbu, a dio je prodan u vašoj radnji: narudžbu morate odbiti."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Prihvati sve" }).click();
  await expect(toast(store, `Ova narudžba se mora odbiti: ${apples} je prodan u vašoj radnji (ostalo je samo 2 kg).`)).toBeVisible();

  await storeContext.close();
});
