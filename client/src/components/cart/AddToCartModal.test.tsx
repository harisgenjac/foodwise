import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import toast from "react-hot-toast";
import AddToCartModal from "./AddToCartModal.js";
import { CartProvider, useCart } from "../../context/CartContext.js";
import { apiMock, makeCart, makeCartLine, makeProduct, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { Cart } from "../../types/index.js";

const product = makeProduct({ id: 7, name: "Hljeb", available_quantity: "8", unit: "kom" });

// Shows the context's line count, to check the modal hands the new cart over.
function CartCount() {
  const { count } = useCart();
  return <p data-testid="cart-count">{count}</p>;
}

const renderModal = (cart: Cart = makeCart([])) => {
  const onClose = vi.fn();
  renderWithProviders(
    <CartProvider enabled>
      <AddToCartModal product={product} onClose={onClose} />
      <CartCount />
    </CartProvider>,
    { user: makeUser({ role: "RESTAURANT" }), get: { "/cart": { cart } } },
  );
  return { onClose };
};

const otherStoreError = () =>
  new AxiosError("Request failed", "409", undefined, undefined, {
    status: 409,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: "U korpi su proizvodi iz druge prodavnice.", code: "CART_OTHER_STORE", store_name: "Bingo Ilidža" },
  });

const quantityField = () => screen.getByLabelText(t("dashboard.quantity"), { exact: false });

describe("AddToCartModal", () => {
  it("adds the product with the quantity and hands the new cart to the context", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.put.mockResolvedValue({ data: { cart: makeCart([makeCartLine({ product_id: 7 })]) } });
    const { onClose } = renderModal();

    expect(screen.getByRole("heading", { name: t("cart.addTitle") })).toBeInTheDocument();
    await userEvent.type(quantityField(), "3");
    await userEvent.click(screen.getByRole("button", { name: t("cart.add") }));

    expect(apiMock.put).toHaveBeenCalledWith("/cart/items/7", { quantity: 3 });
    expect(success).toHaveBeenCalledWith(t("cart.added", { name: "Hljeb" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
  });

  it("checks the quantity against what is available before sending", async () => {
    renderModal();
    await userEvent.type(quantityField(), "9");
    await userEvent.click(screen.getByRole("button", { name: t("cart.add") }));
    expect(await screen.findByText(t("cart.quantityRange"))).toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("starts with the quantity of a product already in the cart", async () => {
    renderModal(makeCart([makeCartLine({ product_id: 7, quantity: "4" })]));
    expect(await screen.findByRole("heading", { name: t("cart.changeTitle") })).toBeInTheDocument();
    expect(quantityField()).toHaveValue(4);
    expect(screen.getByRole("button", { name: t("cart.save") })).toBeInTheDocument();
  });

  it("asks before emptying a cart of another store, then replaces it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.put.mockRejectedValueOnce(otherStoreError()).mockResolvedValueOnce({ data: { cart: makeCart([makeCartLine({ product_id: 7 })]) } });
    const { onClose } = renderModal();

    await userEvent.type(quantityField(), "2");
    await userEvent.click(screen.getByRole("button", { name: t("cart.add") }));

    const dialog = await screen.findByRole("dialog", { name: t("cart.otherStore.title") });
    expect(within(dialog).getByText(t("cart.otherStore.message", { store: "Bingo Ilidža" }))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: t("cart.otherStore.confirm") }));

    await waitFor(() => expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/7", { quantity: 2, replace: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the cart when the restaurant cancels the other-store question", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.put.mockRejectedValueOnce(otherStoreError());
    const { onClose } = renderModal();

    await userEvent.type(quantityField(), "2");
    await userEvent.click(screen.getByRole("button", { name: t("cart.add") }));
    await userEvent.click(await screen.findByRole("button", { name: t("cart.otherStore.cancel") }));

    expect(onClose).toHaveBeenCalled();
    expect(apiMock.put).toHaveBeenCalledTimes(1);
  });
});
