import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import SoldInShopModal from "./SoldInShopModal.js";
import ProductDetailsPage from "../../pages/ProductDetailsPage.js";
import MyProductsPage from "../../pages/MyProductsPage.js";
import { apiMock, axiosError, makeProduct, makeUser, renderWithProviders, t } from "../../test/utils.js";

const STORE = makeUser({ id: 2, role: "STORE" });
const product = makeProduct({ id: 10, store_id: 2, quantity: "60", available_quantity: "50" });

const renderModal = () => {
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  renderWithProviders(<SoldInShopModal product={product} onClose={onClose} onRecorded={onRecorded} />, {
    route: "/",
    path: "/",
    user: STORE,
  });
  return { onClose, onRecorded };
};

const amountField = () => screen.getByLabelText(t("soldInShop.quantity"), { exact: false });
const next = () => userEvent.click(screen.getByRole("button", { name: t("soldInShop.next") }));

describe("SoldInShopModal", () => {
  it("shows the free quantity and refuses an empty, zero or too large amount", async () => {
    renderModal();
    expect(screen.getByText(t("soldInShop.free", { amount: "50", unit: t("units.kg") }), { exact: false })).toBeInTheDocument();
    await next();
    expect(amountField()).toHaveAccessibleDescription(t("common.fieldRequired"));
    await userEvent.type(amountField(), "0");
    await next();
    expect(amountField()).toHaveAccessibleDescription(t("soldInShop.positive"));
    await userEvent.clear(amountField());
    await userEvent.type(amountField(), "50.5");
    await next();
    expect(amountField()).toHaveAccessibleDescription(t("soldInShop.tooMuch"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("asks to confirm with the amount, the free quantity before and after, and that it cannot be undone", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Sale in the shop recorded." } });
    const success = vi.spyOn(toast, "success");
    const { onClose, onRecorded } = renderModal();
    await userEvent.type(amountField(), "50");
    await next();

    // Nothing is sent before the store confirms.
    expect(apiMock.post).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    const unit = t("units.kg");
    expect(dialog).toHaveTextContent(t("soldInShop.confirmAmount", { amount: "50", unit }));
    expect(dialog).toHaveTextContent(t("soldInShop.confirmAfter", { after: "0", before: "50", unit }));
    expect(dialog).toHaveTextContent(t("soldInShop.cannotUndo"));

    await userEvent.click(within(dialog).getByRole("button", { name: t("soldInShop.confirmButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/products/10/shop-sales", { quantity: "50" });
    expect(success).toHaveBeenCalledWith(t("soldInShop.success"));
    expect(onClose).toHaveBeenCalled();
    expect(onRecorded).toHaveBeenCalled();
  });

  it("shows the server's refusal and goes back to the amount", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Možete upisati najviše slobodnu količinu (20)."));
    const error = vi.spyOn(toast, "error");
    const { onClose } = renderModal();
    await userEvent.type(amountField(), "30");
    await next();
    await userEvent.click(screen.getByRole("button", { name: t("soldInShop.confirmButton") }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Možete upisati najviše slobodnu količinu (20)."));
    expect(amountField()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says when nothing is free", () => {
    renderWithProviders(
      <SoldInShopModal product={{ ...product, available_quantity: "0" }} onClose={vi.fn()} onRecorded={vi.fn()} />,
      { route: "/", path: "/", user: STORE },
    );
    expect(screen.getByText(t("soldInShop.nothingFree"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("soldInShop.next") })).not.toBeInTheDocument();
  });
});

describe("Sold in shop on the product page", () => {
  const renderProduct = (user: ReturnType<typeof makeUser>, overrides = {}) =>
    renderWithProviders(<ProductDetailsPage />, {
      route: "/products/10",
      path: "/products/:id",
      user,
      get: {
        "/products/10": { product: { ...product, sold_in_shop: "10", ...overrides } },
        "/products/10/shop-sales": {
          sales: [{ id: 1, quantity: "10", created_at: "2030-01-01T09:00:00.000Z", created_by_email: "s@test.com" }],
        },
      },
    });

  it("gives the store the action, the amount in the stock line and the list of entries", async () => {
    renderProduct(STORE);
    expect(await screen.findByRole("button", { name: t("soldInShop.button") })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t("soldInShop.stockLabel")))).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t("soldInShop.historyTitle") })).toBeInTheDocument();
    expect(screen.getByText(t("soldInShop.historyTotal", { amount: 10, unit: t("units.kg") }))).toBeInTheDocument();
  });

  it("offers nothing when the product is not available", async () => {
    renderProduct(STORE, { status: "Sold" });
    await screen.findByRole("heading", { level: 1, name: "Piletina" });
    expect(screen.queryByRole("button", { name: t("soldInShop.button") })).not.toBeInTheDocument();
  });

  it("shows a restaurant neither the action nor the entries", async () => {
    renderProduct(makeUser({ id: 1, role: "RESTAURANT" }));
    await screen.findByRole("heading", { level: 1, name: "Piletina" });
    expect(screen.queryByRole("button", { name: t("soldInShop.button") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("soldInShop.historyTitle"))).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalledWith("/products/10/shop-sales");
  });
});

describe("Sold in shop on My products", () => {
  it("opens the dialog from an available product with free quantity only", async () => {
    renderWithProviders(<MyProductsPage />, {
      route: "/my-products",
      path: "/my-products",
      user: STORE,
      get: {
        "/products/mine": {
          products: [
            makeProduct({ id: 1, name: "Slobodno", available_quantity: "5" }),
            makeProduct({ id: 2, name: "Rezervisano", available_quantity: "0" }),
          ],
          total: 2,
        },
      },
    });
    await screen.findByText("Slobodno");
    const buttons = screen.getAllByRole("button", { name: t("soldInShop.button") });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    expect(within(screen.getByRole("dialog")).getByText("Slobodno")).toBeInTheDocument();
  });
});
