import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailsPage from "./OrderDetailsPage.js";
import {
  apiMock,
  axiosError,
  makeOrderDetails,
  makeOrderItem,
  makeUser,
  renderWithProviders,
  t,
} from "../test/utils.js";
import type { OrderDetails, User } from "../types/index.js";

const STORE = makeUser({ id: 2, role: "STORE", business_name: "Market Centar" });
const RESTAURANT = makeUser({ id: 1, role: "RESTAURANT", business_name: "Restoran Ukus" });

// Partly accepted: Piletina 20 → 15 kg (not enough in stock), Mlijeko rejected with a note.
const PARTIAL = makeOrderDetails({
  id: 8,
  status: "Confirmed",
  is_partial: true,
  accepted_count: 1,
  item_count: 2,
  ordered_total: "84.00",
  total: "52.50",
  items: [
    makeOrderItem({
      id: 41,
      product_name: "Piletina",
      quantity: "15",
      ordered_quantity: "20",
      unit_price: "3.50",
      status: "Confirmed",
      change_reason: "NOT_ENOUGH_STOCK",
    }),
    makeOrderItem({
      id: 42,
      product_id: 11,
      product_name: "Mlijeko",
      unit: "l",
      quantity: "10",
      ordered_quantity: "10",
      unit_price: "1.40",
      status: "Rejected",
      change_reason: "OTHER",
      change_note: "Ambalaža oštećena",
    }),
  ],
  send_changes: [
    { product_id: 12, name: "Hljeb", unit: "kom", kind: "NOT_SENT_SOLD_OUT", requested: 5, sent: 0, old_price: 1, new_price: 1 },
  ],
  history: [
    { id: 1, item_id: null, from_status: null, to_status: "Pending", source: "RESTAURANT", reason: null, created_at: "2030-01-01T08:00:00.000Z", product_name: null },
    { id: 2, item_id: null, from_status: "Pending", to_status: "Confirmed", source: "STORE", reason: null, created_at: "2030-01-01T09:00:00.000Z", product_name: null },
  ],
});

const renderPage = (user: User, order: OrderDetails | Error = PARTIAL) =>
  renderWithProviders(<OrderDetailsPage />, {
    route: "/orders/8",
    path: "/orders/:id",
    user,
    get: { "/orders/8": order instanceof Error ? order : { order } },
  });

const rowOf = (product: string) =>
  screen.getAllByTestId("order-item").find((row) => within(row).queryByText(product))!;

describe("OrderDetailsPage", () => {
  it("shows the code, the changed lines with their reasons and the new total", async () => {
    renderPage(RESTAURANT);

    expect(await screen.findByRole("heading", { level: 1, name: t("orders.title", { code: "#K7PM" }) })).toBeInTheDocument();
    expect(screen.getByText(t("orders.partiallyAccepted"))).toBeInTheDocument();
    expect(within(rowOf("Piletina")).getByText("20 kg")).toHaveClass("line-through");
    expect(within(rowOf("Piletina")).getByText("15 kg")).toBeInTheDocument();
    expect(within(rowOf("Piletina")).getByText(t("orders.reasons.NOT_ENOUGH_STOCK"))).toBeInTheDocument();
    expect(within(rowOf("Mlijeko")).getByText("Mlijeko")).toHaveClass("line-through");
    expect(within(rowOf("Mlijeko")).getByText("Ambalaža oštećena")).toBeInTheDocument();
    // The order's new total, and Piletina's line (15 kg × 3.50).
    expect(screen.getAllByText("52.50 KM")).toHaveLength(2);
    expect(screen.getByText("84.00 KM")).toHaveClass("line-through");
  });

  it("lists the changes made at sending and the history", async () => {
    renderPage(RESTAURANT);
    expect(await screen.findByText(t("orders.sendChangesTitle"))).toBeInTheDocument();
    expect(screen.getByText(/Hljeb/)).toBeInTheDocument();
    expect(screen.getAllByTestId("order-history")).toHaveLength(2);
    expect(screen.getByText(t("orders.history.created", { who: t("orders.history.sources.RESTAURANT") }))).toBeInTheDocument();
  });

  it("shows the store to the restaurant and the restaurant to the store", async () => {
    renderPage(RESTAURANT);
    expect(await screen.findByText("Titova 1, Sarajevo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("reservations.viewStore") })).toHaveAttribute("href", "/stores/2");
  });

  it("lets the store hand over an accepted order", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order marked as picked up." } });
    renderPage(STORE);

    expect(await screen.findByText("Ferhadija 2, Sarajevo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("pickups.completeButton") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("pickups.confirmCompleteButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/complete");
  });

  it("opens the decision for a Pending order (store) and the cancel for the restaurant", async () => {
    const pending = makeOrderDetails({ id: 8 });
    renderPage(STORE, pending);
    await userEvent.click(await screen.findByRole("button", { name: t("orders.decideButton") }));
    expect(screen.getByRole("heading", { name: t("orders.decision.title", { code: "#K7PM" }) })).toBeInTheDocument();
  });

  it("lets the restaurant cancel a Pending order", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order cancelled." } });
    renderPage(RESTAURANT, makeOrderDetails({ id: 8 }));

    await userEvent.click(await screen.findByRole("button", { name: t("orders.cancelButton") }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t("orders.cancelConfirmationText", { code: "#K7PM", business: "Market Centar" }))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: t("orders.cancelButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/cancel");
    expect(screen.queryByRole("button", { name: t("orders.decideButton") })).not.toBeInTheDocument();
  });

  it("says the order was not found for anyone else", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage(RESTAURANT, axiosError(404, "Order not found."));
    expect(await screen.findByText(t("orders.notFoundTitle"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("orders.backToList") })).toHaveAttribute("href", "/my-orders");
  });
});
