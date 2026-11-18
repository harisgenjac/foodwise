import { screen, within } from "@testing-library/react";
import PackingListPage from "./PackingListPage.js";
import { makeOrder, makeOrderItem, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { PackingOrder, PackingProduct } from "../types/index.js";

const packingOrder = (overrides: Partial<PackingOrder>): PackingOrder => ({
  ...makeOrder({ status: "Confirmed", accepted_count: 1 }),
  ready_time: "2030-01-01T09:30:00.000Z",
  ...overrides,
});

const pickupOrder = packingOrder({
  id: 1,
  code: "AAAA",
  business_name: "Bistro Ukus",
  party_phone: "061111111",
  ready_time: "2030-01-01T08:00:00.000Z",
  items: [
    makeOrderItem({ id: 1, product_name: "Piletina", quantity: "3", unit: "kg", status: "Confirmed" }),
    makeOrderItem({ id: 2, product_name: "Jogurt", quantity: "4", unit: "kom", status: "Rejected" }),
  ],
});

const deliveryOrder = packingOrder({
  id: 2,
  code: "BBBB",
  fulfilment_method: "DELIVERY",
  business_name: "Restoran Most",
  items: [makeOrderItem({ id: 3, product_name: "Mlijeko", quantity: "6", unit: "l", status: "Confirmed" })],
  delivery: {
    status: "COURIER_ASSIGNED",
    price: "5.00",
    cash_to_collect: "20.00",
    estimated_pickup_at: null,
    estimated_delivery_at: null,
    courier_name: "Amir",
    courier_phone: null,
    tracking_url: null,
    failure_reason: null,
    picked_up_at: null,
    delivered_at: null,
  },
});

const PRODUCTS: PackingProduct[] = [
  { product_id: 10, product_name: "Mlijeko", unit: "l", image_url: null, quantity: "6.00", order_count: 1 },
  { product_id: 11, product_name: "Piletina", unit: "kg", image_url: null, quantity: "7.50", order_count: 2 },
];

const renderPage = (orders: PackingOrder[], products: PackingProduct[] = [], pending = 0) =>
  renderWithProviders(<PackingListPage />, {
    route: "/packing",
    path: "/packing",
    user: makeUser({ role: "STORE" }),
    get: {
      "/orders/packing": { orders, products },
      "/orders/store": { orders: [], total: pending },
    },
  });

describe("PackingListPage", () => {
  it("shows the product totals and the orders in the server's ready-time order", async () => {
    renderPage([pickupOrder, deliveryOrder], PRODUCTS);

    const products = await screen.findAllByTestId("packing-product");
    expect(products.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Mlijeko6 l"),
      expect.stringContaining("Piletina7.5 kg"),
    ]);
    expect(within(products[1]!).getByText(t("packing.inOrders", { count: 2 }))).toBeInTheDocument();

    const orders = screen.getAllByTestId("packing-order");
    expect(orders).toHaveLength(2);
    expect(within(orders[0]!).getByText(t("orders.title", { code: "#AAAA" }))).toBeInTheDocument();
    expect(within(orders[0]!).getByText(t("packing.pickupBadge"))).toBeInTheDocument();
    expect(within(orders[0]!).getByRole("link", { name: /061111111/ })).toHaveAttribute("href", "tel:061111111");
    // A rejected line is not packed.
    expect(within(orders[0]!).getByText("Piletina")).toBeInTheDocument();
    expect(within(orders[0]!).queryByText("Jogurt")).not.toBeInTheDocument();

    expect(within(orders[1]!).getByText(t("orders.delivery.badge"))).toBeInTheDocument();
    expect(within(orders[1]!).getByText(new RegExp(`${t("orders.delivery.status.COURIER_ASSIGNED")} · Amir`))).toBeInTheDocument();
    expect(within(orders[1]!).getByText(t("packing.readyForCourier"))).toBeInTheDocument();
    expect(within(orders[1]!).getByRole("link", { name: new RegExp(t("pickups.details")) })).toHaveAttribute(
      "href",
      "/orders/2",
    );

    expect(screen.getByText(t("packing.orderCount", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(t("packing.print")) })).toBeInTheDocument();
  });

  it("marks a delivery that failed before the courier came", async () => {
    renderPage([
      packingOrder({
        fulfilment_method: "DELIVERY",
        delivery: { ...deliveryOrder.delivery!, status: "FAILED", courier_name: null },
      }),
    ]);

    expect(await screen.findByText(t("packing.deliveryFailed"))).toBeInTheDocument();
  });

  it("points to the orders still waiting for a decision", async () => {
    renderPage([], [], 3);

    expect(await screen.findByText(t("packing.emptyTitle"))).toBeInTheDocument();
    const note = await screen.findByRole("link", { name: new RegExp(t("packing.pendingNote", { count: 3 })) });
    expect(note).toHaveAttribute("href", "/orders");
    expect(screen.queryByRole("button", { name: new RegExp(t("packing.print")) })).not.toBeInTheDocument();
  });
});
