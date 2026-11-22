import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import StoreHomeProducts from "./StoreHomeProducts.js";
import { parsePrice } from "./PriceEditor.js";
import AppToaster from "../AppToaster.js";
import { apiMock, makeProduct, makeUser, renderWithProviders } from "../../test/utils.js";
import type { StoreHomeProduct } from "../../types/index.js";

const product = (overrides: Partial<StoreHomeProduct> = {}): StoreHomeProduct => ({
  ...makeProduct({
    id: 7,
    name: "Kroasani",
    description: "Svježi",
    category: "Bakery",
    original_price: "6.00",
    discounted_price: "3.60",
    quantity: "10",
    available_quantity: "7",
    unit: "pak",
    expiry_date: "2030-01-01T00:00:00.000Z",
    days_until_expiry: 0,
  }),
  reserved_quantity: "3",
  ...overrides,
});

const renderProducts = (products = [product()], put?: unknown) => {
  // jsdom has no matchMedia; react-hot-toast asks it about reduced motion.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  const view = renderWithProviders(
    <>
      <AppToaster />
      <StoreHomeProducts products={products} />
    </>,
    { user: makeUser({ role: "STORE" }) },
  );
  if (put !== undefined) apiMock.put.mockImplementation(() => (put instanceof Error ? Promise.reject(put) : Promise.resolve({ data: put })));
  return view;
};

const field = () => screen.getByRole("textbox", { name: "Nova cijena za Kroasani" });
const hint = () => screen.getByTestId("price-hint");

afterEach(() => {
  act(() => toast.remove());
  vi.unstubAllGlobals();
});

describe("parsePrice", () => {
  it("accepts a comma or a point and at most two decimals", () => {
    expect(parsePrice("3,20")).toBe(3.2);
    expect(parsePrice("3.2")).toBe(3.2);
    expect(parsePrice(" 4 ")).toBe(4);
    expect(parsePrice("3,205")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });
});

describe("StoreHomeProducts", () => {
  it("shows each product: discount, name to the product, expiry, available, reserved and the prices", () => {
    renderProducts([product(), product({ id: 8, name: "Sir", reserved_quantity: "0" })]);
    const [croissants, cheese] = screen.getAllByTestId("store-home-product").map((card) => within(card));
    expect(croissants!.getByRole("link", { name: "Kroasani" })).toHaveAttribute("href", "/products/7");
    expect(croissants!.getByText("−40%")).toBeInTheDocument();
    expect(croissants!.getByText("Rezervisano: 3 pak")).toBeInTheDocument();
    expect(croissants!.getByTestId("offer-price")).toHaveTextContent("3,60 KM");
    expect(croissants!.getByText("6,00 KM")).toHaveClass("line-through");
    expect(cheese!.getByText("Nema rezervacija")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Moji proizvodi/ })).toHaveAttribute("href", "/my-products");
  });

  it("shows the new discount for a valid price, with a comma", async () => {
    renderProducts();
    await userEvent.type(field(), "3,00");
    expect(hint()).toHaveTextContent("Novi popust: −50%");
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("refuses 0 and a price not lower than the full price, and ignores Save meanwhile", async () => {
    renderProducts();
    await userEvent.type(field(), "0");
    expect(hint()).toHaveTextContent("Upišite cijenu veću od 0");
    expect(field()).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(screen.getByRole("button", { name: "Spremi" }));
    expect(apiMock.put).not.toHaveBeenCalled();

    await userEvent.clear(field());
    await userEvent.type(field(), "6");
    expect(hint()).toHaveTextContent("Mora biti niža od 6,00 KM");
    await userEvent.click(screen.getByRole("button", { name: "Spremi" }));
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("saves only the new price through the product edit and shows it on the card", async () => {
    renderProducts([product()], { message: "Product updated successfully.", product: { discounted_price: "3.00" } });
    await userEvent.type(field(), "3,00");
    await userEvent.click(screen.getByRole("button", { name: "Spremi" }));

    expect(apiMock.put).toHaveBeenCalledWith("/products/7", {
      name: "Kroasani",
      description: "Svježi",
      category: "Bakery",
      original_price: "6.00",
      discounted_price: "3",
      quantity: "10",
      unit: "pak",
      expiry_date: "2030-01-01",
    });
    const card = within(screen.getByTestId("store-home-product"));
    expect(await card.findByText("3,00 KM")).toBeInTheDocument();
    expect(card.getByText("−50%")).toBeInTheDocument();
    expect(hint()).toHaveTextContent("Cijena promijenjena");
    expect(await screen.findByText("Cijena je promijenjena.")).toBeInTheDocument();
  });

  it("shows the server's message under the field when saving fails", async () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { status: 400, data: { error: "Only available products can be edited." } },
    });
    renderProducts([product()], error);
    await userEvent.type(field(), "3");
    await userEvent.click(screen.getByRole("button", { name: "Spremi" }));
    expect(await screen.findByTestId("price-hint")).toHaveTextContent(/./);
    expect(within(screen.getByTestId("store-home-product")).getByTestId("offer-price")).toHaveTextContent("3,60 KM");
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("opens the Applies to new orders tip on hover, focus and tap, and closes it on Escape", async () => {
    renderProducts();
    const button = screen.getByRole("button", { name: "Za koje narudžbe važi nova cijena" });
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toHaveTextContent("Važi za nove narudžbe");
    expect(tip).toHaveAttribute("data-open", "false");

    fireEvent.mouseEnter(button.parentElement!);
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.mouseLeave(button.parentElement!);
    expect(tip).toHaveAttribute("data-open", "false");

    fireEvent.focus(button);
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tip).toHaveAttribute("data-open", "false");

    fireEvent.click(button);
    expect(tip).toHaveAttribute("data-open", "true");
  });
});
