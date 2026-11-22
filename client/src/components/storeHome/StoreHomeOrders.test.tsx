import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreHomeOrders from "./StoreHomeOrders.js";
import { makeOrder, makeOrderItem, makeUser, renderWithProviders } from "../../test/utils.js";

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => makeOrderItem({ id: 100 + index, product_id: 200 + index, product_name: `Artikal ${index + 1}` }));
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60000 + 20000).toISOString();

const renderOrders = (orders = [makeOrder()], onDecided = vi.fn()) =>
  renderWithProviders(<StoreHomeOrders orders={orders} onDecided={onDecided} />, { user: makeUser({ role: "STORE" }) });

describe("StoreHomeOrders", () => {
  it("shows each order: restaurant, code, method, item count, total, items and the two buttons", () => {
    renderOrders([
      makeOrder({ id: 1, code: "AB12", business_name: "Restoran Ukus", fulfilment_method: "DELIVERY", item_count: 2, total: "52.30", items: items(2) }),
    ]);
    const card = within(screen.getByTestId("store-home-order"));
    expect(card.getByRole("heading", { level: 3, name: "Restoran Ukus" })).toBeInTheDocument();
    expect(card.getByText(/^#AB12 · prije \d+ min$/)).toBeInTheDocument();
    expect(card.getByText("Dostava")).toBeInTheDocument();
    expect(card.getByText(/^2 artikla · /)).toBeInTheDocument();
    expect(card.getByText("52,30 KM")).toBeInTheDocument();
    expect(card.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Artikal 12 kg", "Artikal 22 kg"]);
    expect(card.getByRole("button", { name: "Prihvati narudžbu #AB12 (Restoran Ukus)" })).toHaveTextContent("Prihvati");
    expect(card.getByRole("button", { name: "Odbij narudžbu #AB12 (Restoran Ukus)" })).toHaveTextContent("Odbij");
    expect(screen.getByRole("link", { name: /Sve narudžbe/ })).toHaveAttribute("href", "/orders");
  });

  it("keeps the cards equal in height with the deadline and the buttons at the bottom", () => {
    renderOrders([makeOrder({ id: 1, items: items(1) }), makeOrder({ id: 2, items: items(3), auto_reject_at: inMinutes(30) })]);
    for (const card of screen.getAllByTestId("store-home-order")) {
      // The card fills its grid cell; the item area takes the free height.
      expect(card).toHaveClass("h-full", "flex", "flex-col");
      expect(card.querySelector("ul")!.parentElement).toHaveClass("flex-1");
      // The buttons are the card's last row.
      expect(card.lastElementChild!.querySelectorAll("button")).toHaveLength(2);
    }
    expect(screen.getAllByTestId("store-home-order")[0]!.parentElement).toHaveClass("items-stretch");
  });

  it("lists at most three items and links the rest, with Bosnian plurals, only when there are more", () => {
    renderOrders([
      makeOrder({ id: 1, items: items(3) }),
      makeOrder({ id: 2, items: items(4) }),
      makeOrder({ id: 3, items: items(5) }),
      makeOrder({ id: 4, items: items(8) }),
    ]);
    const [three, four, five, eight] = screen.getAllByTestId("store-home-order").map((card) => within(card));
    expect(three!.getAllByRole("listitem")).toHaveLength(3);
    expect(three!.queryByRole("link")).not.toBeInTheDocument();
    expect(four!.getAllByRole("listitem")).toHaveLength(3);
    expect(four!.getByRole("link", { name: "+ još 1 artikal" })).toHaveAttribute("href", "/orders/2");
    expect(five!.getByRole("link", { name: "+ još 2 artikla" })).toHaveAttribute("href", "/orders/3");
    expect(eight!.getByRole("link", { name: "+ još 5 artikala" })).toHaveAttribute("href", "/orders/4");
  });

  it("shows the time to answer, in orange from 10 minutes left", () => {
    renderOrders([makeOrder({ id: 1, auto_reject_at: inMinutes(8) }), makeOrder({ id: 2, auto_reject_at: inMinutes(19) })]);
    const [soon, later] = screen.getAllByTestId("store-home-order-deadline");
    expect(soon).toHaveTextContent("Odgovorite za 8 min");
    expect(soon).toHaveClass("text-accent-700");
    expect(later).toHaveTextContent("Odgovorite za 19 min");
    expect(later).not.toHaveClass("text-accent-700");
  });

  it("opens the Orders page's decision dialog: Accept on the decision, Reject on rejecting the order", async () => {
    renderOrders([makeOrder({ id: 1, code: "AB12", business_name: "Restoran Ukus" })]);
    await userEvent.click(screen.getByRole("button", { name: "Prihvati narudžbu #AB12 (Restoran Ukus)" }));
    expect(await screen.findByRole("heading", { name: "Odluka o narudžbi #AB12" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Odbij narudžbu #AB12 (Restoran Ukus)" }));
    expect(await screen.findByRole("heading", { name: "Odbij narudžbu #AB12" })).toBeInTheDocument();
  });

  it("shows a short empty state without waiting orders", () => {
    renderOrders([]);
    expect(screen.getByTestId("store-home-orders-empty")).toHaveTextContent("Nema novih narudžbi");
    expect(screen.queryByTestId("store-home-order")).not.toBeInTheDocument();
  });
});
