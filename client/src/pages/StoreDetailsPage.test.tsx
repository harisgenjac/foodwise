import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreDetailsPage from "./StoreDetailsPage.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, makeCart, makeCartLine, makeOrder, makeOrderItem, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import { WEEKDAYS, todayWeekday, type Schedule } from "../utils/schedule.js";
import type { Cart, Order, Product, User } from "../types/index.js";

const everyDay = (hours: Schedule["mon"]) => Object.fromEntries(WEEKDAYS.map((day) => [day, hours])) as Schedule;

const STORE = makeUser({
  id: 2,
  role: "STORE",
  business_name: "Market Centar",
  email: "market.centar.prodaja@primjer-prodavnice.ba",
  address: "Titova 1",
  city: "Sarajevo",
  distance_km: 2.1,
  phone: "033 111 222",
  description: "Svježe svaki dan",
  opening_schedule: everyDay({ open: "00:00", close: "24:00" }),
  pickup_schedule: everyDay({ open: "15:00", close: "19:00" }),
  delivery_enabled: true,
  preparation_minutes: 30,
  orders_paused: false,
  orders_paused_until: null,
});

const PRODUCTS = [
  makeProduct({ id: 1, name: "Jogurt", category: "Dairy", days_until_expiry: 0, available_quantity: "5", unit: "kom" }),
  makeProduct({ id: 2, name: "Kefir", category: "Dairy", days_until_expiry: 4, available_quantity: "3", unit: "kom" }),
  makeProduct({ id: 3, name: "Hljeb", category: "Bakery", days_until_expiry: 3, available_quantity: "8", unit: "kom" }),
];

// GET /cart answers the current `cart`; PUT and DELETE answer the next one.
let cart: Cart;

const renderPage = ({
  store = STORE,
  products = PRODUCTS,
  orders = (_params: { limit: number }) => ({ orders: [] as Order[], total: 0 }),
}: { store?: User; products?: Product[]; orders?: (params: { limit: number }) => unknown } = {}) =>
  renderWithProviders(
    <CartProvider enabled>
      <StoreDetailsPage />
    </CartProvider>,
    {
      route: "/stores/2",
      path: "/stores/:id",
      user: makeUser({ id: 1, role: "RESTAURANT" }),
      get: {
        "/users/stores/2": { store, stats: { active_offers: products.length, expiring_today: 1, max_discount: 50 } },
        "/favorites": { favorites: [] },
        "/products": { products, total: products.length },
        "/orders/mine": orders,
        "/cart": () => ({ cart }),
      },
    },
  );

const cardOf = (name: string) => screen.getAllByTestId("store-product-card").find((card) => within(card).queryByText(name) !== null)!;

beforeEach(() => {
  cart = makeCart([]);
});

describe("StoreDetailsPage", () => {
  describe("header", () => {
    it("shows the name, the open state, the address with the distance and today's hours", async () => {
      renderPage();
      expect(await screen.findByRole("heading", { level: 1, name: "Market Centar" })).toBeInTheDocument();
      expect(screen.getByTestId("store-open-state")).toHaveTextContent("Otvoreno · do 24:00");
      expect(screen.getByTestId("info-address")).toHaveTextContent("Titova 1");
      expect(screen.getByTestId("info-address")).toHaveTextContent("Sarajevo · 2,1 km od vas");
      expect(screen.getByTestId("info-hours")).toHaveTextContent("00:00 – 24:00");
      expect(screen.getByTestId("info-pickup")).toHaveTextContent("15:00 – 19:00");
      expect(within(screen.getByTestId("info-pickup")).getByText(t("storePage.today"))).toBeInTheDocument();
      expect(screen.getByTestId("info-delivery")).toHaveTextContent("Nudi dostavu");
      expect(screen.getByTestId("info-delivery")).toHaveTextContent("Priprema oko 30 min");
    });

    it("opens the whole week with today highlighted, closes on Escape and gives focus back", async () => {
      renderPage({ store: { ...STORE, pickup_schedule: { ...everyDay({ open: "15:00", close: "19:00" }), sun: null } } });
      const button = await screen.findByRole("button", { name: t("storePage.wholeWeekLabel", { title: t("storePage.pickup") }) });
      await userEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      const week = screen.getByTestId("week-hours");
      expect(within(week).getAllByRole("listitem")).toHaveLength(7);
      expect(within(week).getByText(t("schedule.days.sun")).closest("li")).toHaveTextContent(t("storePage.closedDay"));
      const today = within(week).getAllByRole("listitem").find((item) => item.getAttribute("aria-current") === "date")!;
      expect(today).toHaveTextContent(t(`schedule.days.${todayWeekday()}`));

      await userEvent.keyboard("{Escape}");
      expect(screen.queryByTestId("week-hours")).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it("says closed today and when it opens next", async () => {
      const today = todayWeekday();
      const pickup = { ...everyDay({ open: "09:00", close: "12:00" }), [today]: null } as Schedule;
      renderPage({ store: { ...STORE, pickup_schedule: pickup } });
      const item = await screen.findByTestId("info-pickup");
      expect(item).toHaveTextContent(t("storePage.closedToday"));
      expect(item).toHaveTextContent("Otvara sutra u 09:00");
    });

    it("keeps a long email on one line with an ellipsis and the full address as its title", async () => {
      renderPage();
      const email = await screen.findByTestId("store-email");
      expect(email).toHaveAttribute("href", `mailto:${STORE.email}`);
      expect(email).toHaveAttribute("title", STORE.email);
      expect(email).toHaveClass("truncate");
      expect(screen.getByRole("link", { name: "033 111 222" })).toHaveAttribute("href", "tel:033 111 222");
    });

    it("shows the order pause in the delivery column", async () => {
      renderPage({ store: { ...STORE, orders_paused: true, orders_paused_until: null } });
      expect(await screen.findByTestId("info-delivery")).toHaveTextContent(/Narudžbe pauzirane/);
    });

    it("shows a branch's chain chip", async () => {
      renderPage({ store: { ...STORE, company_name: "Bingo d.o.o." } });
      expect(await screen.findByTestId("store-kind")).toHaveTextContent(t("store.chainLabel", { company: "Bingo d.o.o." }));
    });
  });

  describe("products", () => {
    it("puts today's and tomorrow's products in Ističe uskoro and every product in its category row", async () => {
      renderPage();
      const soon = await screen.findByRole("region", { name: t("store.page.expiringSoon") });
      expect(within(soon).getByText("Jogurt")).toBeInTheDocument();
      expect(within(soon).queryByText("Kefir")).not.toBeInTheDocument();
      const dairy = screen.getByRole("region", { name: t("categories.Dairy") });
      expect(within(dairy).getByText("Jogurt")).toBeInTheDocument();
      expect(within(dairy).getByText("Kefir")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Proizvodi/ })).toHaveTextContent("3");
    });

    it("makes a row a slider only with more than four products", async () => {
      const dairy = Array.from({ length: 5 }, (_, index) =>
        makeProduct({ id: 10 + index, name: `Mlijeko ${index}`, category: "Dairy", days_until_expiry: 5 }),
      );
      renderPage({ products: [...dairy, PRODUCTS[2]!] });
      const dairyRow = await screen.findByRole("region", { name: t("categories.Dairy") });
      expect(within(dairyRow).getByTestId("product-slider")).toBeInTheDocument();
      const bakeryRow = screen.getByRole("region", { name: t("categories.Bakery") });
      expect(within(bakeryRow).queryByTestId("product-slider")).not.toBeInTheDocument();
    });

    it("switches to the grid for a category or a search, sorted by the chosen sort", async () => {
      renderPage();
      await screen.findByRole("region", { name: t("store.page.expiringSoon") });
      await userEvent.click(screen.getByRole("button", { name: /Mliječni proizvodi/ }));
      const grid = screen.getByTestId("product-grid");
      expect(within(grid).getAllByTestId("store-product-card")).toHaveLength(2);
      expect(screen.queryByRole("region", { name: t("store.page.expiringSoon") })).not.toBeInTheDocument();

      await userEvent.selectOptions(screen.getByLabelText(t("storePage.sortLabel")), t("storePage.sort.name"));
      expect(within(screen.getByTestId("product-grid")).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Jogurt", "Kefir"]);

      await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${t("store.page.allCategories")}`) }));
      await userEvent.type(screen.getByLabelText(t("store.page.searchPlaceholder")), "hlj");
      expect(within(screen.getByTestId("product-grid")).getAllByTestId("store-product-card")).toHaveLength(1);

      await userEvent.clear(screen.getByLabelText(t("store.page.searchPlaceholder")));
      await userEvent.type(screen.getByLabelText(t("store.page.searchPlaceholder")), "nema");
      expect(screen.getByTestId("store-products-no-match")).toBeInTheDocument();
    });

    it("adds the minimum step with + and turns it into the stepper", async () => {
      apiMock.put.mockImplementation(async (_url: string, body?: unknown) => ({
        data: { cart: (cart = makeCart([makeCartLine({ product_id: 3, name: "Hljeb", unit: "kom", quantity: String((body as { quantity: number }).quantity), available_quantity: "8" })])) },
      }));
      renderPage();
      await screen.findByText("Hljeb");
      await userEvent.click(within(cardOf("Hljeb")).getByRole("button", { name: t("stepper.add", { name: "Hljeb" }) }));
      expect(apiMock.put).toHaveBeenCalledWith("/cart/items/3", { quantity: 1 });
      const field = await within(cardOf("Hljeb")).findByLabelText(t("storePage.quantityField", { name: "Hljeb", unit: "kom" }));
      expect(field).toHaveValue("1");

      await userEvent.click(within(cardOf("Hljeb")).getByRole("button", { name: t("stepper.increase", { name: "Hljeb" }) }));
      expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/3", { quantity: 2 });
      await waitFor(() => expect(field).toHaveValue("2"));
    });

    it("steps grams by 100", async () => {
      apiMock.put.mockResolvedValue({ data: { cart: makeCart([]) } });
      renderPage({ products: [makeProduct({ id: 5, name: "Šafran", category: "Other", unit: "g", available_quantity: "500" })] });
      await userEvent.click(await screen.findByRole("button", { name: t("stepper.add", { name: "Šafran" }) }));
      expect(apiMock.put).toHaveBeenCalledWith("/cart/items/5", { quantity: 100 });
    });

    it("stops + at the free quantity and removes the product below the minimum", async () => {
      cart = makeCart([
        makeCartLine({ product_id: 2, name: "Kefir", unit: "kom", quantity: "3", available_quantity: "3" }),
        makeCartLine({ product_id: 3, name: "Hljeb", unit: "kom", quantity: "1", available_quantity: "8" }),
      ]);
      apiMock.delete.mockResolvedValue({ data: { cart: makeCart([]) } });
      renderPage();
      await waitFor(() => expect(within(cardOf("Kefir")).getByRole("button", { name: t("stepper.increase", { name: "Kefir" }) })).toBeDisabled());

      await userEvent.click(within(cardOf("Hljeb")).getByRole("button", { name: t("stepper.remove", { name: "Hljeb" }) }));
      expect(apiMock.delete).toHaveBeenCalledWith("/cart/items/3");
    });

    it("keeps a typed amount within the free quantity", async () => {
      cart = makeCart([makeCartLine({ product_id: 3, name: "Hljeb", unit: "kom", quantity: "1", available_quantity: "8" })]);
      apiMock.put.mockResolvedValue({ data: { cart } });
      renderPage();
      const field = await within(await waitFor(() => cardOf("Hljeb"))).findByLabelText(t("storePage.quantityField", { name: "Hljeb", unit: "kom" }));
      await userEvent.clear(field);
      await userEvent.type(field, "20{Enter}");
      expect(apiMock.put).toHaveBeenCalledWith("/cart/items/3", { quantity: 8 });
    });
  });

  describe("cart bar", () => {
    it("shows this store's cart with the count, the total and the saving", async () => {
      cart = makeCart([makeCartLine({ product_id: 3, name: "Hljeb", quantity: "2", original_price: "10.00", unit_price_seen: "5.00" })], {
        store: { id: 2, business_name: "Market Centar", orders_paused: false, orders_paused_until: null },
        totals: { lines: 1, total: "10.00" },
      });
      renderPage();
      const bar = await screen.findByTestId("store-cart-bar");
      expect(within(bar).getByTestId("store-cart-bar-store")).toHaveTextContent("Korpa · Market Centar");
      expect(bar).toHaveTextContent("1 proizvod · 10,00 KM");
      expect(bar).toHaveTextContent("Ušteda 10,00 KM");
      expect(within(bar).getByRole("link", { name: t("storePage.cartBar.goToCart") })).toHaveAttribute("href", "/cart");
    });

    it("names the other store when the cart holds its products", async () => {
      cart = makeCart([makeCartLine()]);
      renderPage();
      expect(await screen.findByTestId("store-cart-bar-store")).toHaveTextContent("Korpa · Prodavnica Merkator");
    });

    it("is hidden with an empty cart", async () => {
      renderPage();
      await screen.findByText("Hljeb");
      expect(screen.queryByTestId("store-cart-bar")).not.toBeInTheDocument();
    });
  });

  describe("my orders", () => {
    const ORDERS = [
      makeOrder({ id: 1, code: "K7PM", status: "Pending" }),
      makeOrder({ id: 2, code: "B9TD", status: "Confirmed", is_partial: true }),
      makeOrder({ id: 3, code: "P3VE", status: "Completed", fulfilment_method: "DELIVERY" }),
      makeOrder({ id: 4, code: "F6YA", status: "Rejected", items: [makeOrderItem({ product_name: "Lignje" }), makeOrderItem({ id: 41, product_name: "Orada" })], item_count: 2 }),
    ];

    it("lists the orders with their codes, products and status pills, and loads more", async () => {
      renderPage({
        orders: (params) => ({ orders: params.limit > 10 ? [...ORDERS, makeOrder({ id: 5, code: "T1KS", status: "Cancelled" })] : ORDERS, total: 5 }),
      });
      const tab = await screen.findByRole("tab", { name: /Moje narudžbe/ });
      await waitFor(() => expect(tab).toHaveTextContent("5"));
      await userEvent.click(tab);
      const table = screen.getByRole("table", { name: t("storePage.orders.table") });
      expect(within(table).getByText("#K7PM")).toBeInTheDocument();
      expect(within(table).getByText("Lignje, Orada")).toBeInTheDocument();
      expect(within(table).getAllByTestId("order-status").map((pill) => pill.textContent)).toEqual([
        t("orderStatus.Pending"),
        t("orders.partiallyAccepted"),
        t("orders.statusDelivered"),
        t("orderStatus.Rejected"),
      ]);
      expect(within(table).getByRole("link", { name: t("storePage.orders.detailsLabel", { code: "#K7PM" }) })).toHaveAttribute("href", "/orders/1");

      await userEvent.click(screen.getByRole("button", { name: t("storePage.orders.showMore") }));
      expect(await within(table).findByText("#T1KS")).toBeInTheDocument();
      expect(apiMock.get).toHaveBeenCalledWith("/orders/mine", expect.objectContaining({ params: expect.objectContaining({ store_id: "2", scope: "all", sort: "newest", limit: 20 }) }));
      expect(screen.queryByRole("button", { name: t("storePage.orders.showMore") })).not.toBeInTheDocument();
    });

    it("says when the restaurant has not ordered from the store yet", async () => {
      renderPage();
      await userEvent.click(await screen.findByRole("tab", { name: /Moje narudžbe/ }));
      expect(screen.getByTestId("store-orders-empty")).toHaveTextContent(t("storePage.orders.empty"));
    });
  });

  it("shows the empty state when the store has no products", async () => {
    renderPage({ products: [] });
    expect(await screen.findByTestId("store-products-empty")).toHaveTextContent(t("store.storeNoProducts"));
  });
});
