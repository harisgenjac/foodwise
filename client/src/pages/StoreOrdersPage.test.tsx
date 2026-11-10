import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreOrdersPage from "./StoreOrdersPage.js";
import { apiMock, makeOrder, makeOrderItem, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Order } from "../types/index.js";

const STORE = makeUser({ role: "STORE" });

const renderPage = (orders: Order[]) =>
  renderWithProviders(<StoreOrdersPage />, {
    route: "/orders",
    path: "/orders",
    user: STORE,
    get: { "/orders/store": { orders, total: orders.length } },
  });

const lastParams = () =>
  apiMock.get.mock.calls.filter(([url]) => url === "/orders/store").at(-1)?.[1]?.params as Record<string, unknown>;
const card = (code: string) =>
  screen.getAllByTestId("order-card").find((element) => within(element).queryByText(new RegExp(code)))!;

const PENDING = makeOrder({
  id: 1,
  code: "AAAA",
  business_name: "Restoran Ukus",
  item_count: 3,
  items: [
    makeOrderItem({ id: 11, product_name: "Piletina" }),
    makeOrderItem({ id: 12, product_name: "Mlijeko" }),
    makeOrderItem({ id: 13, product_name: "Sir" }),
  ],
});
const CONFIRMED = makeOrder({ id: 2, code: "BBBB", status: "Confirmed", is_overdue: true, business_name: "Bistro Avlija" });
const PARTIAL = makeOrder({ id: 3, code: "CCCC", status: "Completed", is_partial: true, accepted_count: 1, item_count: 2 });

describe("StoreOrdersPage", () => {
  it("shows each order with its code, products, restaurant and actions", async () => {
    renderPage([PENDING, CONFIRMED, PARTIAL]);

    expect(await screen.findByText(t("orders.title", { code: "#AAAA" }))).toBeInTheDocument();
    expect(within(card("AAAA")).getByText(t("orders.moreItems", { first: "Piletina 2 kg", count: 2 }))).toBeInTheDocument();
    expect(within(card("AAAA")).getByText("Restoran Ukus")).toBeInTheDocument();
    expect(within(card("AAAA")).getByRole("button", { name: t("orders.decideButton") })).toBeInTheDocument();
    expect(within(card("BBBB")).getByRole("button", { name: t("pickups.completeButton") })).toBeInTheDocument();
    expect(within(card("BBBB")).getByRole("button", { name: t("pickups.cancelOverdueButton") })).toBeInTheDocument();
    expect(within(card("CCCC")).getByText(t("orders.partialBadge", { accepted: 1, count: 2 }))).toBeInTheDocument();
    expect(within(card("CCCC")).getByRole("link", { name: t("dashboard.detailsButton") })).toHaveAttribute("href", "/orders/3");
  });

  it("searches by the code without its # and keeps only letters and digits", async () => {
    renderPage([PENDING]);
    await screen.findByText(t("orders.title", { code: "#AAAA" }));

    await userEvent.type(screen.getByLabelText(t("orders.searchCode")), "#k7-p");
    expect(screen.getByLabelText(t("orders.searchCode"))).toHaveValue("#K7P");
    await waitFor(() => expect(lastParams()).toMatchObject({ code: "K7P" }));
  });

  it("opens the decision dialog for a Pending order", async () => {
    renderPage([PENDING]);
    await userEvent.click(await screen.findByRole("button", { name: t("orders.decideButton") }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: t("orders.decision.title", { code: "#AAAA" }) })).toBeInTheDocument();
    expect(within(dialog).getByText("Restoran Ukus")).toBeInTheDocument();
    expect(within(dialog).getAllByTestId("decision-line")).toHaveLength(3);
  });

  it("confirms a pickup of the whole order", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order marked as picked up." } });
    renderPage([CONFIRMED]);
    await userEvent.click(await screen.findByRole("button", { name: t("pickups.completeButton") }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("#BBBB");
    await userEvent.click(within(dialog).getByRole("button", { name: t("pickups.confirmCompleteButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/2/complete");
  });

  it("shows an empty state before the first order", async () => {
    renderPage([]);
    expect(await screen.findByText(t("orders.storeEmptyTitle"))).toBeInTheDocument();
  });
});
