import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import toast from "react-hot-toast";
import CartPage from "./CartPage.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, axiosError, makeCart, makeCartLine, makeUser, renderWithProviders, t } from "../test/utils.js";
import { formatDisplayDate } from "../utils/expiry.js";
import type { Cart } from "../types/index.js";

// GET /cart answers the current `cart`; a test changes it to what the server would answer next.
let cart: Cart;

const renderPage = () =>
  renderWithProviders(
    <CartProvider enabled>
      <CartPage />
    </CartProvider>,
    { route: "/cart", path: "/cart", user: makeUser({ role: "RESTAURANT" }), get: { "/cart": () => ({ cart }) } },
  );

const notSentError = (lines: unknown[]) =>
  new AxiosError("Request failed", "409", undefined, undefined, {
    status: 409,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: "Narudžba nije poslana.", code: "ORDER_NOT_SENT", lines },
  });

const fillPickup = async (date = "05/01/2030", time = "10:00") => {
  await userEvent.type(screen.getByLabelText(t("myReservations.pickupDate")), date);
  await userEvent.type(screen.getByLabelText(t("myReservations.pickupTime")), time);
};

const lines = () => screen.getAllByTestId("cart-line");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("CartPage", () => {
  it("shows an empty cart with a link to the offers", async () => {
    cart = makeCart([]);
    renderPage();
    expect(await screen.findByText(t("cart.empty.title"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("cart.empty.action") })).toHaveAttribute("href", "/browse-products");
  });

  it("shows the store, the lines and that nothing is reserved", async () => {
    cart = makeCart([makeCartLine({ product_id: 1, name: "Piletina" }), makeCartLine({ product_id: 2, name: "Hljeb", quantity: "3", discounted_price: "1.20", unit_price_seen: "1.20" })]);
    renderPage();
    expect(await screen.findByRole("link", { name: "Prodavnica Merkator" })).toHaveAttribute("href", "/stores/2");
    expect(lines()).toHaveLength(2);
    expect(screen.getByText(t("cart.notHeld"))).toBeInTheDocument();
    expect(within(lines()[1]!).getByText("3.60 KM")).toBeInTheDocument();
  });

  it("shows the flags of changed lines and acts on them", async () => {
    cart = makeCart([
      makeCartLine({ product_id: 1, name: "Rasprodano", available_quantity: "0", flags: { unavailable: true, unavailable_reason: "SOLD_OUT" } as Cart["items"][number]["flags"] }),
      makeCartLine({ product_id: 2, name: "Malo", quantity: "5", available_quantity: "2", flags: { quantity_exceeds: true } as Cart["items"][number]["flags"] }),
      makeCartLine({ product_id: 3, name: "Jeftinije", unit_price_seen: "6.00", discounted_price: "5.00", flags: { price_lowered: true } as Cart["items"][number]["flags"] }),
      makeCartLine({ product_id: 4, name: "Skuplje", unit_price_seen: "5.00", discounted_price: "6.00", flags: { price_raised: true } as Cart["items"][number]["flags"] }),
    ]);
    apiMock.put.mockResolvedValue({ data: { cart } });
    apiMock.delete.mockResolvedValue({ data: { cart } });
    renderPage();
    await screen.findByText("Rasprodano");
    const [soldOut, less, lower, higher] = lines();

    expect(within(soldOut!).getByText(t("cart.unavailable"))).toBeInTheDocument();
    expect(within(soldOut!).getByText(`· ${t("cart.reasons.SOLD_OUT")}`)).toBeInTheDocument();
    expect(within(soldOut!).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(lower!).getByText("6.00 KM")).toHaveClass("line-through");
    expect(within(higher!).getByText(t("cart.priceRaised", { price: "6.00 KM", old: "5.00 KM" }))).toBeInTheDocument();

    await userEvent.click(within(less!).getByRole("button", { name: t("cart.reduceTo", { amount: "2 kg" }) }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/2", { quantity: 2 });

    await userEvent.click(within(higher!).getByRole("button", { name: t("cart.acceptPrice") }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/4", { quantity: 2, accept_price: true });

    await userEvent.click(screen.getByRole("button", { name: t("cart.removeUnavailable") }));
    expect(apiMock.delete).toHaveBeenLastCalledWith("/cart/unavailable");

    await userEvent.click(within(lower!).getByRole("button", { name: t("cart.remove", { name: "Jeftinije" }) }));
    expect(apiMock.delete).toHaveBeenLastCalledWith("/cart/items/3");
  });

  it("changes a line's quantity on blur", async () => {
    cart = makeCart([makeCartLine({ product_id: 1, name: "Piletina", quantity: "2" })]);
    apiMock.put.mockResolvedValue({ data: { cart: makeCart([makeCartLine({ product_id: 1, quantity: "4" })]) } });
    renderPage();
    const field = await screen.findByLabelText(t("cart.quantityLabel", { name: "Piletina" }));
    await userEvent.clear(field);
    await userEvent.type(field, "4");
    await userEvent.tab();
    expect(apiMock.put).toHaveBeenCalledWith("/cart/items/1", { quantity: 4 });
    await waitFor(() => expect(field).toHaveValue(4));
  });

  it("empties the cart after a confirmation", async () => {
    cart = makeCart();
    apiMock.delete.mockResolvedValue({ data: { cart: makeCart([]) } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("cart.emptyCart") }));
    const dialog = screen.getByRole("dialog", { name: t("cart.emptyConfirm.title") });
    await userEvent.click(within(dialog).getByRole("button", { name: t("cart.emptyCart") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/cart");
    expect(await screen.findByText(t("cart.empty.title"))).toBeInTheDocument();
  });

  it("limits the pickup day to the earliest expiry among the orderable lines", async () => {
    cart = makeCart([
      makeCartLine({ product_id: 1, expiry_date: "2030-01-10" }),
      makeCartLine({ product_id: 2, expiry_date: "2030-01-04" }),
      makeCartLine({ product_id: 3, expiry_date: "2029-12-01", flags: { unavailable: true, unavailable_reason: "EXPIRED" } as Cart["items"][number]["flags"] }),
    ]);
    renderPage();
    expect(await screen.findByText(t("cart.checkout.pickupUntil", { date: formatDisplayDate("2030-01-04") }))).toBeInTheDocument();
    await fillPickup("05/01/2030");
    await userEvent.click(screen.getByRole("button", { name: t("orders.send.submit") }));
    expect(await screen.findByText(t("myReservations.pickupDateOutOfRange"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("sends the orderable lines with the seen prices and shows what was sent", async () => {
    cart = makeCart([
      makeCartLine({ product_id: 1, name: "Piletina", quantity: "4", unit_price_seen: "5.00" }),
      makeCartLine({ product_id: 2, name: "Sir", quantity: "1", unit_price_seen: "8.00", discounted_price: "9.00", flags: { price_raised: true } as Cart["items"][number]["flags"] }),
      makeCartLine({ product_id: 3, name: "Mlijeko", flags: { unavailable: true, unavailable_reason: "SOLD_OUT" } as Cart["items"][number]["flags"] }),
    ]);
    apiMock.post.mockImplementation(async () => {
      // What GET /cart answers after sending: the sent line is gone.
      cart = makeCart([cart.items[1]!, cart.items[2]!]);
      return {
        data: {
          order: { id: 55, code: "K7PM", pickup_at: "2030-01-05T10:00:00", items: [{ quantity: "4", unit_price: "5.00" }] },
          changes: [{ product_id: 2, name: "Sir", unit: "kg", kind: "NOT_SENT_PRICE_RAISED", requested: 1, sent: 0, old_price: 8, new_price: 9 }],
        },
      };
    });
    renderPage();
    await screen.findByText("Piletina");
    await fillPickup();
    await userEvent.click(screen.getByRole("checkbox", { name: t("orders.send.acceptPartial") }));
    await userEvent.click(screen.getByRole("button", { name: t("orders.send.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/orders", {
      pickup_at: "2030-01-05T10:00",
      accept_partial: false,
      items: [
        { product_id: 1, quantity: 4, unit_price: "5.00" },
        { product_id: 2, quantity: 1, unit_price: "8.00" },
      ],
    });
    expect(await screen.findByRole("heading", { name: t("orders.send.sentTitle", { code: "#K7PM" }) })).toBeInTheDocument();
    expect(screen.getByText(t("orders.send.sentText", { total: "20.00 KM", store: "Prodavnica Merkator" }))).toBeInTheDocument();
    expect(screen.getByText(t("orders.sendChanges.NOT_SENT_PRICE_RAISED", { product: "Sir", requested: "1 kg", sent: "0 kg", oldPrice: "8.00 KM", newPrice: "9.00 KM" }))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("cart.sent.viewOrder") })).toHaveAttribute("href", "/orders/55");

    // Lines that were not sent wait in the cart.
    await userEvent.click(await screen.findByRole("button", { name: t("cart.sent.backToCart") }));
    expect(lines()).toHaveLength(2);
  });

  it("marks the lines that stopped the order when nothing was sent", async () => {
    const errorToast = vi.spyOn(toast, "error");
    cart = makeCart([makeCartLine({ product_id: 1, name: "Piletina" }), makeCartLine({ product_id: 2, name: "Hljeb" })]);
    apiMock.post.mockRejectedValue(notSentError([{ product_id: 2, kind: "QUANTITY_REDUCED", requested: 2, available: 1, unit_price: 5 }]));
    renderPage();
    await screen.findByText("Piletina");
    await fillPickup();
    await userEvent.click(screen.getByRole("button", { name: t("orders.send.submit") }));

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(t("cart.checkout.notSent")));
    expect(within(lines()[1]!).getByText(t("cart.notSentLine"))).toBeInTheDocument();
    expect(within(lines()[0]!).queryByText(t("cart.notSentLine"))).not.toBeInTheDocument();
  });

  it("shows the server's answer when the pending-order limit is reached, and the count near it", async () => {
    const errorToast = vi.spyOn(toast, "error");
    cart = makeCart([makeCartLine()], { pending_orders: 9 });
    apiMock.post.mockRejectedValue(axiosError(409, "Imate previše narudžbi koje čekaju odgovor (10)."));
    renderPage();
    expect(await screen.findByText(t("cart.checkout.pending", { pending: 9, max: 10 }))).toBeInTheDocument();
    await fillPickup();
    await userEvent.click(screen.getByRole("button", { name: t("orders.send.submit") }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Imate previše narudžbi koje čekaju odgovor (10)."));
  });

  it("cannot send a cart with nothing orderable", async () => {
    cart = makeCart([makeCartLine({ flags: { unavailable: true, unavailable_reason: "REMOVED" } as Cart["items"][number]["flags"] })]);
    renderPage();
    expect(await screen.findByText(t("cart.checkout.nothingToSend"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("orders.send.submit") })).toBeDisabled();
  });
});
