import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailsPage from "./OrderDetailsPage.js";
import { apiMock, axiosError, makeOrderDetails, makeOrderItem, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { OrderDelivery, OrderDetails } from "../types/index.js";

// The restaurant's order page (components/orderPage, design/order-details/). The clock is fixed at
// 10 January 2030, 12:00 local time, so "today" and the times are known.
const RESTAURANT = makeUser({ id: 1, role: "RESTAURANT", business_name: "Restoran Ukus" });
const NOW = new Date(2030, 0, 10, 12, 0);

// A local time on the fixed day (dayOffset -1 = yesterday).
const at = (hours: number, minutes: number, dayOffset = 0) => new Date(2030, 0, 10 + dayOffset, hours, minutes).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const confirmedItem = makeOrderItem({ id: 41, status: "Confirmed" });

const pickupOrder = (overrides: Partial<OrderDetails> = {}) =>
  makeOrderDetails({
    id: 8,
    created_at: at(9, 30),
    pickup_at: at(18, 0),
    can_report_problem: true,
    steps: { ...makeOrderDetails().steps, sent_at: at(9, 30) },
    ...overrides,
  });

const accepted = (overrides: Partial<OrderDetails> = {}) =>
  pickupOrder({ status: "Confirmed", decided_at: at(10, 0), accepted_count: 1, items: [confirmedItem], ...overrides });

const deliveryOrder = (delivery: Partial<OrderDelivery> = {}, overrides: Partial<OrderDetails> = {}) =>
  accepted({
    fulfilment_method: "DELIVERY",
    delivery_address: "Titova 20, Sarajevo",
    delivery_fee_estimate: "3.50",
    delivery_estimated_at: at(13, 0),
    ready_at: at(12, 30),
    pickup_at: at(12, 40),
    delivery: {
      status: "CREATED",
      price: "3.50",
      cash_to_collect: "13.50",
      estimated_pickup_at: at(12, 40),
      estimated_delivery_at: at(13, 0),
      courier_name: null,
      courier_phone: null,
      tracking_url: null,
      failure_reason: null,
      ...delivery,
    },
    ...overrides,
  });

const COURIER: Partial<OrderDelivery> = {
  status: "COURIER_ASSIGNED",
  courier_name: "Amir Hodžić",
  courier_phone: "061222333",
  courier_photo_url: "https://example.test/courier.jpg",
  courier_vehicle: "SCOOTER",
  courier_assigned_at: at(11, 50),
  tracking_url: "http://localhost:5173/dev/tracking/abc",
};

const renderPage = (order: OrderDetails | Error) =>
  renderWithProviders(<OrderDetailsPage />, {
    route: "/orders/8",
    path: "/orders/:id",
    user: RESTAURANT,
    get: { "/orders/8": order instanceof Error ? order : { order } },
  });

const hero = () => screen.getByTestId("order-hero");
const title = () => within(hero()).getByTestId("hero-title");
const line = () => within(hero()).getByTestId("hero-line");
const steps = () => within(hero()).getAllByTestId("order-step");
const stepStates = () => steps().map((step) => step.getAttribute("data-state"));
const card = (id: string) => screen.getByTestId(id);

describe("OrderDetailsPage for a restaurant: the hero", () => {
  it("waits for the store in yellow, with the deadline, the steps and the cancel", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order cancelled." } });
    renderPage(pickupOrder({ auto_reject_at: at(15, 0) }));

    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.pending") })).toBeInTheDocument();
    expect(title()).toHaveAttribute("data-tone", "waiting");
    expect(title()).toHaveClass("text-warning-300");
    expect(line()).toHaveTextContent("Prodavnica treba odgovoriti do 15:00");
    expect(within(hero()).getByText(t("orders.title", { code: "#K7PM" }))).toBeInTheDocument();
    expect(stepStates()).toEqual(["done", "current", "upcoming", "upcoming"]);
    // The seal is grey until the order is done.
    expect(within(hero()).getByTestId("success-seal")).toHaveAttribute("data-filled", "false");

    await userEvent.click(within(hero()).getByRole("button", { name: t("orders.cancelButton") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("orders.cancelButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/cancel");
  });

  it("says what was accepted after a partial acceptance, in white", async () => {
    renderPage(
      accepted({
        is_partial: true,
        item_count: 2,
        accepted_count: 1,
        pickup_at: at(10, 0, 1),
        items: [confirmedItem, makeOrderItem({ id: 42, product_id: 11, product_name: "Mlijeko", status: "Rejected", change_reason: "QUALITY" })],
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.partial") })).toBeInTheDocument();
    expect(title()).toHaveClass("text-white");
    expect(line()).toHaveTextContent("1 od 2 stavke · preuzimanje sutra u 10:00");
    expect(within(hero()).queryByTestId("hero-alert")).not.toBeInTheDocument();
    expect(within(hero()).queryByRole("button", { name: t("orders.cancelButton") })).not.toBeInTheDocument();
  });

  it("marks a late pickup with the coral alert, a peach line and the late step", async () => {
    renderPage(accepted({ is_overdue: true, pickup_at: at(13, 30, -1) }));
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.late") })).toBeInTheDocument();
    expect(title()).toHaveAttribute("data-tone", "failure");
    expect(title()).toHaveClass("text-white");
    expect(within(hero()).getByTestId("hero-alert")).toBeInTheDocument();
    expect(line()).toHaveClass("text-[#FFD6CC]");
    expect(line()).toHaveTextContent("Termin je bio jučer u 13:30. Prodavnica može otkazati narudžbu.");
    expect(within(steps()[2]!).getByTestId("step-marker")).toHaveAttribute("data-marker", "ringDanger");
    expect(card("time-card")).toHaveTextContent("Jučer · 13:30");
    expect(card("time-card")).toHaveTextContent("Kasni 1 dan");
  });

  it("shows the courier on the way to the store with the exact times", async () => {
    renderPage(deliveryOrder(COURIER));
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.courierAssigned") })).toBeInTheDocument();
    expect(line()).toHaveTextContent("Kurir dolazi u prodavnicu u 12:40 · u restoranu za 1 h (13:00)");
    expect(stepStates()).toEqual(["done", "done", "done", "current", "upcoming"]);
  });

  it("counts the courier's arrival down every minute", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
    renderPage(
      deliveryOrder(
        { ...COURIER, status: "PICKED_UP", picked_up_at: at(11, 55), estimated_delivery_at: at(12, 12) },
        { status: "InDelivery", picked_up_at: at(11, 55) },
      ),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.onTheWay") })).toBeInTheDocument();
    expect(line()).toHaveTextContent("Stiže za 12 min · dolazak u restoran u 12:12");
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.courierIn"));
    expect(card("time-card")).toHaveTextContent("12 min");
    expect(card("time-card")).toHaveTextContent("Dolazak u 12:12");

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(card("time-card")).toHaveTextContent("11 min");
    expect(line()).toHaveTextContent("Stiže za 11 min");
  });

  // The clock is at 12:00; a courier who picked the order up at 10:00 and the given estimate.
  const pickedUp = (estimate: string) =>
    deliveryOrder(
      { ...COURIER, status: "PICKED_UP", picked_up_at: at(10, 0), estimated_delivery_at: estimate },
      { status: "InDelivery", picked_up_at: at(10, 0) },
    );

  it("says the courier arrives any minute for 5 minutes after the estimate", async () => {
    renderPage(pickedUp(at(11, 57)));
    await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.onTheWay") });
    expect(line()).toHaveTextContent("Stiže svakog trenutka · dolazak u restoran u 11:57");
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.courierArriving"));
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.now"));
  });

  it("says how late the courier is once 5 minutes past the estimate", async () => {
    renderPage(pickedUp(at(11, 53)));
    await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.onTheWay") });
    expect(line()).toHaveTextContent("Kasni 7 min · dolazak u restoran u 11:53");
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.courierLate"));
    expect(card("time-card")).toHaveTextContent("7 min");
    expect(card("time-card")).toHaveTextContent("Dolazak u 11:53");
  });

  it("counts a long delay in hours", async () => {
    renderPage(pickedUp(at(9, 45)));
    await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.onTheWay") });
    expect(line()).toHaveTextContent("Kasni 2 h 15 min · dolazak u restoran u 09:45");
    expect(card("time-card")).toHaveTextContent("2 h 15 min");
  });

  it("says how late an assigned courier is at the restaurant", async () => {
    renderPage(deliveryOrder({ ...COURIER, estimated_pickup_at: at(11, 30), estimated_delivery_at: at(11, 50) }));
    await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.courierAssigned") });
    expect(line()).toHaveTextContent("Kurir dolazi u prodavnicu u 11:30 · u restoranu kasni 10 min (11:50)");
  });

  it("offers pickup at the store or a cancel after a failed delivery", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order switched to pickup." } });
    const failed = deliveryOrder(
      { status: "FAILED", failure_code: "NO_COURIER", failure_reason: "No courier.", failed_at: at(11, 40) },
      { items: [makeOrderItem({ id: 41, status: "Confirmed", expiry_date: "2030-01-15" })] },
    );
    renderPage(failed);

    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.deliveryFailed") })).toBeInTheDocument();
    expect(line()).toHaveTextContent("Nijedan kurir nije bio dostupan. Odaberite kako dalje.");
    expect(stepStates()).toEqual(["done", "done", "failed", "upcoming", "upcoming"]);
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.selfPickup"));

    const actions = within(hero()).getByTestId("delivery-failed");
    await userEvent.click(within(actions).getByRole("button", { name: t("orders.deliveryFailed.pickupButton") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("orderForm.pickupDate")), "12/01/2030");
    await userEvent.type(within(dialog).getByLabelText(t("orderForm.pickupTime")), "10:00");
    await userEvent.click(within(dialog).getByRole("button", { name: t("orders.deliveryFailed.pickupConfirm") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/switch-to-pickup", { pickup_at: "2030-01-12T10:00" });
  });

  it("cancels after a failed delivery", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order cancelled." } });
    renderPage(deliveryOrder({ status: "FAILED", failure_code: "NO_COURIER", failure_reason: "No courier." }));
    const actions = await screen.findByTestId("delivery-failed");
    await userEvent.click(within(actions).getByRole("button", { name: t("orders.cancelButton") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("orders.cancelButton") }));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/cancel-failed-delivery", undefined);
  });

  it("has no choice once the courier had the goods, and the failure is on the last step", async () => {
    renderPage(
      deliveryOrder({ ...COURIER, status: "FAILED", picked_up_at: at(11, 55), failed_at: at(12, 0) }, { status: "InDelivery" }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.deliveryFailed") })).toBeInTheDocument();
    expect(stepStates()).toEqual(["done", "done", "done", "done", "failed"]);
    expect(screen.queryByTestId("delivery-failed")).not.toBeInTheDocument();
  });

  it("is lime with the filled seal once delivered, and the last step tells the real time", async () => {
    renderPage(
      deliveryOrder(
        { ...COURIER, status: "DELIVERED", picked_up_at: at(11, 20), delivered_at: at(11, 38), estimated_delivery_at: at(11, 40) },
        { status: "Completed", picked_up_at: at(11, 20) },
      ),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.delivered") })).toBeInTheDocument();
    expect(title()).toHaveClass("text-lime");
    expect(line()).toHaveTextContent("Kurir je dostavio narudžbu danas u 11:38");
    expect(within(hero()).getByTestId("success-seal")).toHaveAttribute("data-filled", "true");
    const last = within(steps()[4]!).getByRole("button", { name: /Isporučeno/ });
    act(() => last.focus());
    expect(within(hero()).getByRole("tooltip")).toHaveTextContent("Dostavljeno danas u 11:38 (najavljeno 11:40).");
    expect(within(hero()).getByRole("tooltip")).toHaveTextContent("Kuriru plaćeno 13,50 KM gotovinom.");
    expect(card("time-card")).toHaveTextContent("Danas · 11:38");
    expect(card("money-card")).toHaveTextContent(t("orderPage.cards.paidCourier"));
  });

  it("says the store confirmed a pickup", async () => {
    renderPage(accepted({ status: "Completed", picked_up_at: at(11, 12) }));
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.pickedUp") })).toBeInTheDocument();
    const last = within(steps()[3]!).getByRole("button", { name: /Preuzeto/ });
    act(() => last.focus());
    expect(within(hero()).getByRole("tooltip")).toHaveTextContent("Prodavnica je potvrdila preuzimanje danas u 11:12.");
  });

  it("shows two steps for a rejected order, with the store's reason", async () => {
    renderPage(
      pickupOrder({
        status: "Rejected",
        total: "0.00",
        decided_at: at(10, 0),
        items: [makeOrderItem({ id: 41, status: "Rejected", change_reason: "QUALITY" })],
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.rejected") })).toBeInTheDocument();
    expect(line()).toHaveTextContent(`Razlog: ${t("orders.reasons.QUALITY")}`);
    expect(within(hero()).getByTestId("hero-alert")).toBeInTheDocument();
    expect(stepStates()).toEqual(["done", "failed"]);
    expect(within(steps()[1]!).getByTestId("step-label")).toHaveTextContent(t("myOrders.steps.rejected"));
    expect(card("money-card")).toHaveTextContent("Naručeno 10,00 KM");
  });

  it("says when the store did not answer in time", async () => {
    renderPage(
      pickupOrder({
        status: "Rejected",
        items: [makeOrderItem({ id: 41, status: "Rejected" })],
        steps: { ...makeOrderDetails().steps, decision: "AUTO_REJECTED", decided_at: at(10, 0) },
      }),
    );
    expect(await screen.findByTestId("hero-line")).toHaveTextContent(t("orderPage.headline.autoRejected"));
  });

  it("shows two steps for an order the restaurant cancelled", async () => {
    renderPage(
      pickupOrder({
        status: "Cancelled",
        items: [makeOrderItem({ id: 41, status: "Cancelled" })],
        steps: { ...makeOrderDetails().steps, cancelled_at: at(10, 5), cancelled_by: "RESTAURANT" },
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: t("orderPage.headline.cancelled.RESTAURANT") })).toBeInTheDocument();
    expect(stepStates()).toEqual(["done", "failed"]);
    expect(within(steps()[1]!).getByTestId("step-label")).toHaveTextContent(t("myOrders.steps.cancelled"));
  });

  it("has step info only on the steps reached, on focus and hover", async () => {
    renderPage(pickupOrder({ auto_reject_at: at(15, 0) }));
    await screen.findByTestId("order-hero");
    expect(within(hero()).getAllByRole("button", { name: /Poslano|Čeka odgovor/ })).toHaveLength(2);
    expect(within(steps()[2]!).queryByRole("button")).not.toBeInTheDocument();
    const dot = within(steps()[0]!).getByTestId("step-marker");
    fireEvent.pointerEnter(dot, { pointerType: "mouse" });
    expect(within(hero()).getByRole("tooltip")).toHaveTextContent("Poslano danas u 09:30");
    fireEvent.pointerLeave(dot, { pointerType: "mouse" });
    expect(within(hero()).queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("OrderDetailsPage for a restaurant: the cards", () => {
  it("shows the pickup time, the store and the total of a pending order", async () => {
    renderPage(pickupOrder());
    expect(await screen.findByTestId("time-card")).toHaveTextContent("Danas · 18:00");
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.ifAccepted"));
    expect(card("store-card")).toHaveTextContent("Market Centar");
    expect(card("store-card")).toHaveTextContent("Titova 1, Sarajevo");
    expect(card("money-card")).toHaveTextContent("10,00 KM");
    expect(card("money-card")).toHaveTextContent(t("orders.itemCount", { count: 1 }));
  });

  it("shows the cash for the courier of a delivery", async () => {
    renderPage(deliveryOrder());
    expect(await screen.findByTestId("money-card")).toHaveTextContent(t("orderPage.cards.payCourier"));
    expect(card("money-card")).toHaveTextContent("13,50 KM");
    expect(card("money-card")).toHaveTextContent("Roba 10,00 KM + dostava 3,50 KM");
    expect(card("time-card")).toHaveTextContent(t("orderPage.cards.findingCourier"));
  });

  it("strikes rejected lines, shows reduced ones and the old total", async () => {
    renderPage(
      accepted({
        is_partial: true,
        item_count: 2,
        ordered_total: "84.00",
        total: "52.50",
        items: [
          makeOrderItem({ id: 41, product_name: "Piletina", quantity: "15", ordered_quantity: "20", unit_price: "3.50", status: "Confirmed", change_reason: "NOT_ENOUGH_STOCK" }),
          makeOrderItem({ id: 42, product_id: 11, product_name: "Mlijeko", image_url: null, unit: "l", quantity: "10", ordered_quantity: "10", unit_price: "1.40", status: "Rejected", change_reason: "OTHER", change_note: "Ambalaža oštećena" }),
        ],
      }),
    );
    const items = await screen.findAllByTestId("order-item");
    const [chicken, milk] = items as [HTMLElement, HTMLElement];
    expect(within(chicken).getByText(/20 kg → 15 kg/)).toBeInTheDocument();
    expect(within(chicken).getByTestId("item-note")).toHaveTextContent(`Prihvaćeno manje: 15 od 20 kg · ${t("orders.reasons.NOT_ENOUGH_STOCK")}`);
    expect(within(chicken).getByRole("link", { name: "Piletina" })).toHaveAttribute("href", "/products/10");
    expect(within(milk).getByRole("link", { name: "Mlijeko" })).toHaveClass("line-through");
    expect(within(milk).getByTestId("item-note")).toHaveTextContent("Odbijeno: Ambalaža oštećena");
    expect(within(milk).getByTestId("item-note")).toHaveClass("text-danger-700");
    expect(within(milk).getByTestId("item-total")).toHaveClass("line-through");
    // Without an image, the product's initial.
    expect(within(milk).getByText("M")).toBeInTheDocument();
    expect(screen.getByTestId("old-total")).toHaveTextContent("84,00 KM");
    expect(screen.getByTestId("items-total")).toHaveTextContent("52,50 KM");
    expect(card("money-card")).toHaveTextContent("Bilo 84,00 KM");
  });

  it("links the store and the courier, with the call buttons", async () => {
    renderPage(deliveryOrder(COURIER));
    const contact = await screen.findByTestId("order-contact");
    expect(within(contact).getByRole("link", { name: "Market Centar" })).toHaveAttribute("href", "/stores/2");
    expect(within(contact).getByRole("link", { name: t("orderPage.contact.callStore", { name: "Market Centar" }) })).toHaveAttribute(
      "href",
      "tel:033 111 222",
    );
    // The store's line shows its phone, not the address (the store card above has the address).
    const storeLine = within(contact).getByTestId("contact-store");
    expect(storeLine).toHaveTextContent("033 111 222");
    expect(storeLine).not.toHaveTextContent("Titova 1");
    const courier = within(contact).getByTestId("contact-courier");
    expect(within(courier).getByRole("img", { name: t("orderPage.contact.courierPhoto", { name: "Amir Hodžić" }) })).toHaveAttribute(
      "src",
      "https://example.test/courier.jpg",
    );
    expect(within(courier).getByTestId("courier-vehicle")).toBeInTheDocument();
    expect(within(courier).getByRole("link", { name: /^Amir Hodžić/ })).toHaveAttribute("href", "http://localhost:5173/dev/tracking/abc");
    expect(courier).toHaveTextContent("Kurir · Skuter · 061222333");
    const call = within(courier).getByRole("link", { name: t("orderPage.contact.callCourier", { name: "Amir Hodžić" }) });
    expect(call).toHaveAttribute("href", "tel:061222333");
    expect(call).toHaveClass("h-11", "w-11");
  });

  it("shows the courier's initials while there is no photo", async () => {
    renderPage(deliveryOrder({ ...COURIER, courier_photo_url: null, courier_vehicle: null, tracking_url: null }));
    const courier = await screen.findByTestId("contact-courier");
    expect(within(courier).getByRole("img", { name: t("orderPage.contact.courierPhoto", { name: "Amir Hodžić" }) })).toHaveTextContent("AH");
    expect(within(courier).queryByTestId("courier-vehicle")).not.toBeInTheDocument();
    expect(within(courier).queryByRole("link", { name: /^Amir Hodžić/ })).not.toBeInTheDocument();
  });

  it("opens the accordion sections, with the history, the changes at sending and the problem reports", async () => {
    renderPage(
      pickupOrder({
        send_changes: [{ product_id: 12, name: "Hljeb", unit: "kom", kind: "NOT_SENT_SOLD_OUT", requested: 5, sent: 0, old_price: 1, new_price: 1 }],
        history: [
          { id: 1, item_id: null, from_status: null, to_status: "Pending", source: "RESTAURANT", reason: null, created_at: at(9, 30), product_name: null },
        ],
        problems: [
          {
            id: 3,
            fulfilment_method: "PICKUP",
            reason: "MISSING_ITEM",
            text: "Nema hljeba",
            status: "RESOLVED",
            admin_reply: "Prodavnica vraća novac.",
            replied_at: at(11, 0),
            resolved_at: at(11, 0),
            created_at: at(10, 0),
          },
        ],
      }),
    );
    const accordion = await screen.findByTestId("order-accordion");
    const details = within(accordion).getByRole("button", { name: new RegExp(t("orderPage.accordion.orderDetails")) });
    expect(details).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(details.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(within(panel).getByText(t("orders.sendChangesTitle"))).toBeInTheDocument();
    expect(within(panel).getByTestId("problem-report")).toHaveTextContent(t("orders.problems.statuses.RESOLVED"));
    expect(within(panel).getByTestId("problem-reply")).toHaveTextContent("Prodavnica vraća novac.");

    const history = within(accordion).getByRole("button", { name: /Historija/ });
    expect(history).toHaveTextContent(t("orderPage.accordion.changes", { count: 1 }));
    await userEvent.click(history);
    expect(screen.getByTestId("order-history")).toHaveTextContent(t("orders.history.created", { who: t("orders.history.sources.RESTAURANT") }));
    expect(within(accordion).getByRole("button", { name: /Prodavnica/ })).toHaveTextContent("Market Centar");
  });

  it("keeps out of Detalji narudžbe what the top of the page already shows", async () => {
    renderPage(deliveryOrder(COURIER));
    const accordion = await screen.findByTestId("order-accordion");
    const details = within(accordion).getByRole("button", { name: new RegExp(t("orderPage.accordion.orderDetails")) });
    expect(details).toHaveTextContent(t("orderPage.accordion.rows", { count: 3 }));
    await userEvent.click(details);
    const panel = document.getElementById(details.getAttribute("aria-controls")!)!;
    const labels = within(panel)
      .getAllByTestId("detail-row")
      .map((row) => row.querySelector("dt")?.textContent);
    expect(labels).toEqual([t("orders.delivery.address"), t("orderPage.details.orderedAt"), t("orders.partialSetting")]);
    expect(panel).toHaveTextContent("Titova 20, Sarajevo");
    expect(panel).not.toHaveTextContent(t("orders.delivery.cash"));
    expect(panel).not.toHaveTextContent(t("orders.delivery.statusLabel"));
  });
});

describe("OrderDetailsPage for a restaurant: Prijavi problem", () => {
  it("offers the delivery reasons, sends only with a reason, and confirms", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Problem reported.", problem: { id: 1 } } });
    renderPage(deliveryOrder(COURIER));
    const open = await screen.findByRole("button", { name: t("orderPage.problem.open") });
    await userEvent.click(open);

    const dialog = screen.getByRole("dialog", { name: t("orderPage.problem.title") });
    expect(within(dialog).getByText("Narudžba #K7PM · Market Centar")).toBeInTheDocument();
    const group = within(dialog).getByRole("group", { name: t("orderPage.problem.question") });
    expect(within(group).getAllByRole("radio")).toHaveLength(6);
    const send = within(dialog).getByRole("button", { name: t("orderPage.problem.send") });
    expect(send).toBeDisabled();

    await userEvent.click(within(group).getByRole("radio", { name: t("orders.problems.reasons.LATE") }));
    await userEvent.type(within(dialog).getByLabelText(t("orderPage.problem.description")), "Kasni pola sata");
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/problems", { reason: "LATE", text: "Kasni pola sata" });

    expect(await within(dialog).findByText(t("orderPage.problem.sentTitle"))).toBeInTheDocument();
    expect(within(dialog).getByText(t("orderPage.problem.sentText"))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: t("orderPage.problem.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the pickup reasons, closes on Escape and returns the focus", async () => {
    renderPage(accepted());
    const open = await screen.findByRole("button", { name: t("orderPage.problem.open") });
    await userEvent.click(open);
    const dialog = screen.getByRole("dialog");
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["PICKUP_TIME", "MISSING_ITEM", "DAMAGED", "STORE", "OTHER"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("shows the server's error in the dialog", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(400, "Problem se može prijaviti do 48 sati nakon završetka narudžbe."));
    renderPage(accepted());
    await userEvent.click(await screen.findByRole("button", { name: t("orderPage.problem.open") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getAllByRole("radio")[0]!);
    await userEvent.click(within(dialog).getByRole("button", { name: t("orderPage.problem.send") }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Problem se može prijaviti do 48 sati nakon završetka narudžbe.");
    expect(within(dialog).queryByText(t("orderPage.problem.sentTitle"))).not.toBeInTheDocument();
  });

  it("is hidden once a problem can no longer be reported", async () => {
    renderPage(accepted({ status: "Completed", picked_up_at: at(10, 0, -3), can_report_problem: false }));
    await screen.findByTestId("order-contact");
    expect(screen.queryByRole("button", { name: t("orderPage.problem.open") })).not.toBeInTheDocument();
  });
});

describe("OrderDetailsPage for a restaurant: the courier rating", () => {
  const delivered = (overrides: Partial<OrderDetails> = {}) =>
    deliveryOrder(
      { ...COURIER, status: "DELIVERED", picked_up_at: at(11, 20), delivered_at: at(11, 38) },
      {
        status: "Completed",
        can_rate_courier: true,
        courier_rating: null,
        courier_rating_until: at(11, 38, 7),
        ...overrides,
      },
    );

  it("rates the courier once a star is chosen, then locks the stars", async () => {
    apiMock.post.mockResolvedValue({
      data: { message: "Courier rated.", rating: { rating: 4, comment: "Brzo", courier_name: "Amir Hodžić", created_at: at(12, 0), sent_at: null } },
    });
    renderPage(delivered());
    const rating = await screen.findByTestId("courier-rating");
    expect(within(rating).getByRole("heading", { name: t("orderPage.rating.title") })).toBeInTheDocument();
    expect(rating).toHaveTextContent("Ocijenite kurira Amir Hodžić.");
    const send = within(rating).getByRole("button", { name: t("orderPage.rating.send") });
    expect(send).toBeDisabled();

    const group = within(rating).getByRole("group", { name: t("orderPage.rating.group") });
    const four = within(group).getByRole("button", { name: t("orderPage.rating.star", { value: 4 }) });
    await userEvent.click(four);
    expect(four).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(within(rating).getByLabelText(t("orderPage.rating.comment")), "Brzo");
    await userEvent.click(send);
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/courier-rating", { rating: 4, comment: "Brzo" });

    expect(await within(rating).findByRole("heading", { name: t("orderPage.rating.thanksTitle") })).toBeInTheDocument();
    expect(rating).toHaveTextContent(t("orderPage.rating.thanksText"));
    for (const star of within(group).getAllByRole("button")) expect(star).toBeDisabled();
    expect(within(rating).queryByRole("button", { name: t("orderPage.rating.send") })).not.toBeInTheDocument();
  });

  it("shows the locked stars of an order already rated", async () => {
    renderPage(
      delivered({
        can_rate_courier: false,
        courier_rating: { rating: 5, comment: null, courier_name: "Amir Hodžić", created_at: at(11, 50), sent_at: at(11, 50) },
      }),
    );
    const rating = await screen.findByTestId("courier-rating");
    expect(rating).toHaveAttribute("data-locked", "true");
    expect(within(rating).getByRole("button", { name: t("orderPage.rating.star", { value: 5 }) })).toHaveAttribute("aria-pressed", "true");
  });

  it("is gone after the 7 days, and never shows for an order not delivered", async () => {
    const { unmount } = renderPage(
      delivered({
        can_rate_courier: false,
        courier_rating: { rating: 5, comment: null, courier_name: "Amir Hodžić", created_at: at(11, 50, -9), sent_at: null },
        courier_rating_until: at(11, 38, -1),
      }),
    );
    await screen.findByTestId("order-hero");
    expect(screen.queryByTestId("courier-rating")).not.toBeInTheDocument();
    unmount();

    renderPage(deliveryOrder(COURIER));
    await screen.findByTestId("order-hero");
    expect(screen.queryByTestId("courier-rating")).not.toBeInTheDocument();
  });
});
