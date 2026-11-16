import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreDetailsPage from "./StoreDetailsPage.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, axiosError, makeCart, makeCartLine, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import { WEEKDAYS, type Schedule } from "../utils/schedule.js";
import type { Cart, Product, User } from "../types/index.js";

const everyDay = (hours: Schedule["mon"]) => Object.fromEntries(WEEKDAYS.map((day) => [day, hours])) as Schedule;

const STORE = makeUser({
  id: 2,
  role: "STORE",
  business_name: "Market Centar",
  address: "Titova 1",
  city: "Sarajevo",
  phone: "033 111 222",
  description: "Svježe svaki dan",
  opening_schedule: { ...everyDay({ open: "08:00", close: "20:00" }), sun: null },
  pickup_schedule: everyDay({ open: "15:00", close: "19:00" }),
  open_now: true,
  cover_url: null,
});

const PRODUCTS = [
  makeProduct({ id: 1, store_id: 2, name: "Jogurt", category: "Dairy", days_until_expiry: 0, available_quantity: "5", unit: "kom" }),
  makeProduct({ id: 2, store_id: 2, name: "Kefir", category: "Dairy", days_until_expiry: 4, available_quantity: "3", unit: "kom" }),
  makeProduct({ id: 3, store_id: 2, name: "Hljeb", category: "Bakery", days_until_expiry: 3, available_quantity: "8", unit: "kom" }),
];

// GET /cart answers the current `cart`; PUT and DELETE answer the next one.
let cart: Cart;

const renderPage = ({ store = STORE, products = PRODUCTS }: { store?: User; products?: Product[] } = {}) =>
  renderWithProviders(
    <CartProvider enabled>
      <StoreDetailsPage />
    </CartProvider>,
    {
      route: "/stores/2",
      path: "/stores/:id",
      user: makeUser({ id: 1, role: "RESTAURANT" }),
      get: {
        "/users/stores/2": { store, stats: { active_offers: 3, expiring_today: 1, max_discount: 50 } },
        "/favorites": { favorites: [] },
        "/products": { products, total: products.length },
        "/cart": () => ({ cart }),
      },
    },
  );

const cardOf = (name: string) =>
  screen.getAllByTestId("store-product-card").find((card) => within(card).queryByText(name) !== null)!;

beforeEach(() => {
  cart = makeCart([]);
});

describe("StoreDetailsPage", () => {
  it("shows the header, open now, today's pickup and the short stats", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Market Centar" })).toBeInTheDocument();
    expect(screen.getByText(t("store.page.openNow"))).toBeInTheDocument();
    expect(screen.getByText(t("store.page.pickupToday", { hours: "15:00–19:00" }))).toBeInTheDocument();
    expect(screen.getByText("Titova 1, Sarajevo")).toBeInTheDocument();
    expect(screen.getByText(t("store.page.activeOffers"))).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByTestId("store-cover")).not.toBeInTheDocument();
  });

  it("shows the cover and Closed, and no badge without weekly hours", async () => {
    const { unmount } = renderPage({ store: { ...STORE, cover_url: "/uploads/covers/2-1-ab.png", open_now: false } });
    expect(await screen.findByTestId("store-cover")).toHaveAttribute("src", expect.stringContaining("/uploads/covers/"));
    expect(screen.getByText(t("store.page.closedNow"))).toBeInTheDocument();
    unmount();

    renderPage({ store: { ...STORE, open_now: null, opening_schedule: null } });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(t("store.page.openNow"))).not.toBeInTheDocument();
    expect(screen.queryByText(t("store.page.closedNow"))).not.toBeInTheDocument();
  });

  it("lists expiring products first, then the rest by category", async () => {
    renderPage();
    const soon = await screen.findByRole("region", { name: t("store.page.expiringSoon") });
    expect(within(soon).getByText("Jogurt")).toBeInTheDocument();
    expect(within(soon).queryByText("Kefir")).not.toBeInTheDocument();
    const dairy = screen.getByRole("region", { name: t("categories.Dairy") });
    expect(within(dairy).getByText("Kefir")).toBeInTheDocument();
    expect(within(dairy).queryByText("Jogurt")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: t("categories.Bakery") })).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/products", expect.objectContaining({ params: expect.objectContaining({ store_id: "2", sort: "expiry" }) }));
  });

  it("filters by search and category chips, with a no-results state", async () => {
    renderPage();
    await screen.findByText("Hljeb");
    await userEvent.click(screen.getByRole("button", { name: t("categories.Bakery") }));
    expect(screen.queryByText("Kefir")).not.toBeInTheDocument();
    expect(screen.getByText("Hljeb")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("store.page.allCategories") }));
    await userEvent.type(screen.getByLabelText(t("store.page.searchPlaceholder")), "kef");
    expect(screen.getByText("Kefir")).toBeInTheDocument();
    expect(screen.queryByText("Hljeb")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(t("store.page.searchPlaceholder")), "xyz");
    expect(screen.getByText(t("store.noResultsTitle"))).toBeInTheDocument();
  });

  it("shows the empty state without offers", async () => {
    renderPage({ products: [] });
    expect(await screen.findByText(t("store.storeNoProducts"))).toBeInTheDocument();
  });

  it("adds with + and the + turns into a stepper that changes and removes the line", async () => {
    renderPage();
    await screen.findByText("Kefir");
    cart = makeCart([makeCartLine({ product_id: 2, name: "Kefir", quantity: "1", unit: "kom", available_quantity: "3" })]);
    apiMock.put.mockResolvedValueOnce({ data: { cart } });
    await userEvent.click(within(cardOf("Kefir")).getByRole("button", { name: t("stepper.add", { name: "Kefir" }) }));
    expect(apiMock.put).toHaveBeenCalledWith("/cart/items/2", { quantity: 1 });

    const stepper = await within(cardOf("Kefir")).findByRole("group", { name: t("stepper.label", { name: "Kefir" }) });
    expect(within(stepper).getByText("1 kom")).toBeInTheDocument();

    cart = makeCart([makeCartLine({ product_id: 2, name: "Kefir", quantity: "2", unit: "kom", available_quantity: "3" })]);
    apiMock.put.mockResolvedValueOnce({ data: { cart } });
    await userEvent.click(within(stepper).getByRole("button", { name: t("stepper.increase", { name: "Kefir" }) }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/2", { quantity: 2 });
    expect(await within(cardOf("Kefir")).findByText("2 kom")).toBeInTheDocument();

    cart = makeCart([]);
    apiMock.put.mockResolvedValueOnce({ data: { cart: makeCart([makeCartLine({ product_id: 2, name: "Kefir", quantity: "1", unit: "kom" })]) } });
    await userEvent.click(within(cardOf("Kefir")).getByRole("button", { name: t("stepper.decrease", { name: "Kefir" }) }));
    apiMock.delete.mockResolvedValueOnce({ data: { cart } });
    await userEvent.click(await within(cardOf("Kefir")).findByRole("button", { name: t("stepper.remove", { name: "Kefir" }) }));
    expect(apiMock.delete).toHaveBeenCalledWith("/cart/items/2");
    expect(await within(cardOf("Kefir")).findByRole("button", { name: t("stepper.add", { name: "Kefir" }) })).toBeInTheDocument();
  });

  it("asks to empty the cart when it holds another store's products", async () => {
    renderPage();
    await screen.findByText("Kefir");
    const conflict = axiosError(409, "U korpi su proizvodi druge prodavnice.");
    Object.assign(conflict.response!.data, { code: "CART_OTHER_STORE", store_name: "Druga prodavnica" });
    apiMock.put.mockRejectedValueOnce(conflict);
    await userEvent.click(within(cardOf("Kefir")).getByRole("button", { name: t("stepper.add", { name: "Kefir" }) }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t("cart.otherStore.message", { store: "Druga prodavnica" }))).toBeInTheDocument();
    cart = makeCart([makeCartLine({ product_id: 2, name: "Kefir", quantity: "1" })]);
    apiMock.put.mockResolvedValueOnce({ data: { cart } });
    await userEvent.click(within(dialog).getByRole("button", { name: t("cart.otherStore.confirm") }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/2", { quantity: 1, replace: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the cart bar and the cart panel with this store's lines", async () => {
    cart = makeCart([makeCartLine({ product_id: 2, name: "Kefir", quantity: "2", unit: "kom" })], {
      store: { id: 2, business_name: "Market Centar", orders_paused: false, orders_paused_until: null },
      totals: { lines: 1, total: "45.00" },
    });
    renderPage();
    const bar = await screen.findByTestId("store-cart-bar");
    expect(bar).toHaveAttribute("href", "/cart");
    expect(bar).toHaveTextContent("1");
    const panel = screen.getByRole("region", { name: t("store.page.cartTitle") });
    expect(within(panel).getByText("Kefir")).toBeInTheDocument();
    expect(screen.getByText(t("orders.send.acceptPartial"))).toBeInTheDocument();
  });

  it("says when the cart holds another store's products", async () => {
    cart = makeCart([makeCartLine({ product_id: 9, name: "Mlijeko" })], { store: { id: 7, business_name: "Druga", orders_paused: false, orders_paused_until: null } });
    renderPage();
    expect(
      await screen.findByText(t("store.page.cartOtherStore", { store: "Druga", count: 1 })),
    ).toBeInTheDocument();
  });

  it("shows address, phone, weekly hours and the description on the Information tab", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("tab", { name: t("store.page.infoTab") }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("033 111 222")).toHaveAttribute("href", "tel:033 111 222");
    expect(within(panel).getByText("Pon–Sub")).toBeInTheDocument();
    expect(within(panel).getByText("08:00–20:00")).toBeInTheDocument();
    expect(within(panel).getByText(t("schedule.closed"))).toBeInTheDocument();
    expect(within(panel).getByText("15:00–19:00")).toBeInTheDocument();
    expect(within(panel).getByText("Svježe svaki dan")).toBeInTheDocument();
  });

  it("toggles the favorite", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t("store.addToFavorites")) }));
    expect(apiMock.post).toHaveBeenCalledWith("/favorites", { store_id: "2" });
  });
});
