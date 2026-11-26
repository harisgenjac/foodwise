import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyOrdersPage from "./MyOrdersPage.js";
import { apiMock, axiosError, makeOrder, makeOrderItem, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Order, OrderDelivery } from "../types/index.js";
import { fullDate } from "../utils/dayGroups.js";

// A fixed midday clock, so "today" and "yesterday" never cross midnight while the suite runs.
const NOW = new Date(2026, 9, 20, 12, 0);
// Today (or `dayOffset` days away) at hh:mm local time, as the API sends it.
const at = (hours: number, minutes: number, dayOffset = 0) =>
  new Date(2026, 9, 20 + dayOffset, hours, minutes).toISOString();

// An order of one product (2 kg at 5 KM unless the item says otherwise), sent at 11:48 today.
const order = (id: number, product = "Piletina", extra: Partial<Order> = {}, item: Parameters<typeof makeOrderItem>[0] = {}) =>
  makeOrder({ id, code: `K${id}PM`, created_at: at(11, 48), items: [makeOrderItem({ product_name: product, ...item })], ...extra });

const delivery = (extra: Partial<OrderDelivery> = {}): OrderDelivery => ({
  status: "CREATED",
  price: "3.00",
  cash_to_collect: "12.90",
  estimated_pickup_at: at(14, 5),
  estimated_delivery_at: at(14, 40),
  courier_name: null,
  courier_phone: null,
  tracking_url: null,
  failure_reason: null,
  picked_up_at: null,
  delivered_at: null,
  ready_at: at(13, 30),
  courier_assigned_at: null,
  failed_at: null,
  ...extra,
});

// An accepted delivery order in a given courier state.
const deliveryOrder = (id: number, status: Order["status"], extra: Partial<OrderDelivery> = {}) =>
  order(id, "Grožđe", {
    status,
    fulfilment_method: "DELIVERY",
    decided_at: at(11, 51),
    ready_at: at(13, 30),
    delivery_estimated_at: at(14, 30),
    pickup_at: at(14, 5),
    accepted_count: 1,
    delivery: delivery(extra),
  });

const SUMMARY = {
  total: 65,
  active: 6,
  counts: { Pending: 2, Confirmed: 3, InDelivery: 1, Completed: 40, Rejected: 10, Cancelled: 9 },
};

// The list mock gets the request params, so a test can answer Active and History differently.
const renderPage = (orders: Order[] | ((params: Record<string, unknown>) => Order[]), total?: number) =>
  renderWithProviders(<MyOrdersPage />, {
    route: "/my-orders",
    path: "/my-orders",
    user: makeUser(),
    get: {
      "/orders/mine": (params: unknown) => {
        const list = typeof orders === "function" ? orders(params as Record<string, unknown>) : orders;
        return { orders: list, total: total ?? list.length };
      },
      "/orders/mine/summary": { summary: SUMMARY },
    },
  });

const listCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/orders/mine");
const lastListParams = () => listCalls().at(-1)?.[1]?.params;
const summaryCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/orders/mine/summary");

const tab = (key: "active" | "history") => screen.getByRole("tab", { name: new RegExp(t(`orders.tabs.${key}`)) });
const searchField = () => screen.getByPlaceholderText(t("myOrders.filters.search"));
const sortSelect = () => screen.queryByLabelText(t("filters.sortBy"));
const openFilters = () => userEvent.click(screen.getByRole("button", { name: new RegExp(t("listFilters.button")) }));
const panel = () => screen.getByRole("dialog", { name: t("listFilters.title") });
const pill = (group: string, name: string) =>
  within(within(panel()).getByRole("group", { name: group })).getByRole("button", { name });
const pillNames = (group: string) =>
  within(within(panel()).getByRole("group", { name: group })).getAllByRole("button").map((button) => button.textContent);
const chips = () => screen.queryAllByTestId("active-filter").map((chip) => chip.textContent);
const card = (code: string) =>
  screen.getAllByTestId("my-order-card").find((element) => element.textContent?.includes(`#${code}`))!;
const steps = (code: string) => within(within(card(code)).getByRole("list", { name: t("myOrders.steps.label", { code: `#${code}` }) }));
const stepStates = (code: string) => steps(code).getAllByTestId("order-step").map((step) => step.getAttribute("data-state"));
// How each dot is drawn, and which lines are green.
const markers = (code: string) => steps(code).getAllByTestId("step-marker").map((marker) => marker.getAttribute("data-marker"));
const lines = (code: string) => steps(code).getAllByTestId("step-line").map((line) => line.getAttribute("data-filled"));

describe("MyOrdersPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on Active with the active scope, newest first, 12 at a time, and the tab counts", async () => {
    renderPage([order(1)]);
    expect(await screen.findByText("Piletina 2 kg")).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(tab("active")).toHaveAttribute("aria-selected", "true");
    expect(lastListParams()).toMatchObject({ scope: "active", sort: "newest", q: "", method: "", status: "", limit: 12 });
    expect(lastListParams()).not.toHaveProperty("from");
    expect(lastListParams()).not.toHaveProperty("to");
    await waitFor(() => expect(within(tab("history")).getByText("65")).toBeInTheDocument());
    expect(within(tab("active")).getByText("6")).toBeInTheDocument();
    expect(summaryCalls()).toEqual([["/orders/mine/summary"]]);
    // No header button to Search any more.
    expect(screen.queryByRole("link", { name: t("dashboard.browseOffers") })).not.toBeInTheDocument();
  });

  it("searches the product, the store and the code with one field", async () => {
    renderPage([order(1)]);
    await screen.findByText("Piletina 2 kg");
    await userEvent.type(searchField(), "#k1pm");
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", q: "#k1pm" }));
    await userEvent.clear(searchField());
    await userEvent.type(searchField(), "Market");
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: "Market" }));
    // The search is not a chip, but "Očisti" clears it.
    expect(chips()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: t("listFilters.clear") }));
    expect(searchField()).toHaveValue("");
  });

  it("filters Active by method and status in the panel, with chips, and Očisti clears them", async () => {
    renderPage([order(1)]);
    await screen.findByText("Piletina 2 kg");
    await openFilters();

    expect(pillNames(t("myOrders.filters.methodLabel"))).toEqual(["Sve", "Preuzimanje", "Dostava"]);
    expect(pillNames(t("myOrders.filters.statusLabel"))).toEqual(["Svi", "Na čekanju", "Prihvaćena", "U dostavi"]);
    expect(within(panel()).queryByTestId("date-range")).not.toBeInTheDocument();

    await userEvent.click(pill(t("myOrders.filters.methodLabel"), "Dostava"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", method: "delivery" }));
    expect(pill(t("myOrders.filters.methodLabel"), "Dostava")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(pill(t("myOrders.filters.statusLabel"), "Prihvaćena"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ method: "delivery", status: "Confirmed" }));

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chips()).toEqual(["Dostava", "Prihvaćena"]);
    expect(screen.getByTestId("filter-count")).toHaveTextContent("2");

    await userEvent.click(screen.getByRole("button", { name: t("listFilters.remove", { filter: t("myOrders.filters.methodLabel") }) }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ method: "", status: "Confirmed" }));

    await userEvent.click(screen.getByRole("button", { name: t("listFilters.clear") }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ method: "", status: "" }));
    expect(chips()).toEqual([]);
  });

  it("shows the sort under the bar on Active only, and a tab switch resets the search and filters but keeps the sort", async () => {
    renderPage((params) => (params.scope === "all" ? [order(9, "Jogurt", { status: "Completed" })] : [order(1)]));
    await screen.findByText("Piletina 2 kg");

    await userEvent.selectOptions(sortSelect()!, t("orders.sortPickupSoonest"));
    await userEvent.type(searchField(), "pile");
    await openFilters();
    await userEvent.click(pill(t("myOrders.filters.methodLabel"), "Preuzimanje"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", sort: "pickup", q: "pile", method: "pickup" }));

    await userEvent.click(tab("history"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", sort: "newest", q: "", method: "", status: "", from: "", to: "" }));
    expect(searchField()).toHaveValue("");
    expect(chips()).toEqual([]);
    expect(sortSelect()).not.toBeInTheDocument();

    // History has every status and the order dates Od/Do.
    await openFilters();
    expect(pillNames(t("myOrders.filters.statusLabel"))).toEqual([
      "Svi",
      "Na čekanju",
      "Prihvaćena",
      "U dostavi",
      "Preuzeto / isporučeno",
      "Odbijeno",
      "Otkazano",
    ]);
    expect(within(panel()).getByRole("group", { name: t("myOrders.filters.periodLabel") })).toBeInTheDocument();
    await userEvent.click(pill(t("myOrders.filters.statusLabel"), "Odbijeno"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", status: "Rejected" }));
    await userEvent.keyboard("{Escape}");
    expect(chips()).toEqual(["Odbijeno"]);

    await userEvent.click(tab("active"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", sort: "pickup", status: "" }));
    expect(lastListParams()).not.toHaveProperty("from");
    expect(sortSelect()).toHaveValue("pickup");
  });

  it("filters History by the order dates Od and Do, with one chip", async () => {
    renderPage((params) => (params.scope === "all" ? [order(9, "Jogurt", { status: "Completed" })] : [order(1)]));
    await screen.findByText("Piletina 2 kg");
    await userEvent.click(tab("history"));
    await openFilters();
    const range = within(panel()).getByRole("group", { name: t("myOrders.filters.periodLabel") });
    await userEvent.type(within(range).getByLabelText(t("myOrders.filters.from")), "01102026");
    await userEvent.tab();
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", from: "2026-10-01", to: "" }));
    await userEvent.type(within(range).getByLabelText(t("myOrders.filters.to")), "15102026");
    await userEvent.tab();
    await waitFor(() => expect(lastListParams()).toMatchObject({ from: "2026-10-01", to: "2026-10-15" }));
    await userEvent.keyboard("{Escape}");
    expect(chips()).toEqual(["Naručeno: 01/10/2026 – 15/10/2026"]);

    // The chip's × clears both dates.
    await userEvent.click(screen.getByRole("button", { name: t("listFilters.remove", { filter: t("myOrders.filters.periodLabel") }) }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ from: "", to: "" }));
    expect(chips()).toEqual([]);
  });

  it("filters by one date only, and a start after the end drops the end", async () => {
    renderPage((params) => (params.scope === "all" ? [order(9, "Jogurt", { status: "Completed" })] : [order(1)]));
    await screen.findByText("Piletina 2 kg");
    await userEvent.click(tab("history"));
    await openFilters();
    await userEvent.type(within(panel()).getByLabelText(t("myOrders.filters.to")), "10102026");
    await userEvent.tab();
    await waitFor(() => expect(lastListParams()).toMatchObject({ from: "", to: "2026-10-10" }));
    await userEvent.type(within(panel()).getByLabelText(t("myOrders.filters.from")), "12102026");
    await userEvent.tab();
    await waitFor(() => expect(lastListParams()).toMatchObject({ from: "2026-10-12", to: "" }));
    await userEvent.keyboard("{Escape}");
    expect(chips()).toEqual(["Od 12/10/2026"]);
  });

  describe("the order card", () => {
    it("has 4 steps for a pending pickup, the answer deadline and Otkaži", async () => {
      renderPage([order(1, "Šljive", { auto_reject_at: at(15, 2), pickup_at: at(18, 0) })]);
      await screen.findByText("Šljive 2 kg");

      expect(stepStates("K1PM")).toEqual(["done", "current", "upcoming", "upcoming"]);
      // Waiting for the store's answer keeps the green ring.
      expect(markers("K1PM")).toEqual(["done", "ring", "upcoming", "upcoming"]);
      const waiting = steps("K1PM").getAllByTestId("order-step")[1]!;
      expect(within(waiting).getByRole("button")).toHaveTextContent(t("myOrders.steps.waiting"));
      expect(within(waiting).getByTestId("step-detail")).toHaveTextContent("do 15:02");
      expect(within(card("K1PM")).getByTestId("answer-deadline")).toHaveTextContent("Prodavnica treba odgovoriti do 15:02");
      expect(within(card("K1PM")).getByText(/naručeno 11:48/)).toBeInTheDocument();
      expect(within(card("K1PM")).getByTestId("order-when")).toHaveTextContent("Danas · 18:00");
      expect(within(card("K1PM")).getByRole("button", { name: t("myOrders.card.cancelLabel", { code: "#K1PM" }) })).toBeInTheDocument();
      expect(within(card("K1PM")).getByRole("link", { name: t("storePage.orders.detailsLabel", { code: "#K1PM" }) })).toHaveAttribute(
        "href",
        "/orders/1",
      );
      // The success seal is the last step.
      expect(steps("K1PM").getAllByTestId("order-step").at(-1)).toHaveTextContent(t("myOrders.steps.pickedUp"));
    });

    it("offers Otkaži only on a pending order", async () => {
      renderPage([order(1), order(2, "Mlijeko", { status: "Confirmed", decided_at: at(11, 55), accepted_count: 1 })]);
      await screen.findByText("Mlijeko 2 kg");
      expect(screen.getAllByRole("button", { name: /^Otkaži narudžbu/ })).toHaveLength(1);
      expect(within(card("K2PM")).queryByRole("button", { name: /Otkaži/ })).not.toBeInTheDocument();
      expect(within(card("K2PM")).queryByTestId("answer-deadline")).not.toBeInTheDocument();
    });

    it("has 5 steps for a delivery, with the exact arrival time", async () => {
      renderPage([deliveryOrder(3, "InDelivery", { status: "PICKED_UP", courier_assigned_at: at(13, 20), picked_up_at: at(13, 58) })]);
      await screen.findByText("Grožđe 2 kg");

      expect(stepStates("K3PM")).toEqual(["done", "done", "done", "done", "current"]);
      // The line is green up to the seal, which stays grey until delivered.
      expect(markers("K3PM")).toEqual(["done", "done", "done", "done", "pending"]);
      expect(lines("K3PM")).toEqual(["true", "true", "true", "true"]);
      const last = steps("K3PM").getAllByTestId("order-step").at(-1)!;
      expect(last).toHaveTextContent(t("myOrders.steps.delivered"));
      expect(within(last).getByTestId("step-detail")).toHaveTextContent(/^14:40$/);
      expect(within(card("K3PM")).getByTestId("order-when")).toHaveTextContent("Danas · 14:40");
      expect(card("K3PM").textContent).not.toMatch(/oko|okvirno/);
      expect(steps("K3PM").getByText("13:20")).toBeInTheDocument();
      expect(steps("K3PM").getByText("13:58")).toBeInTheDocument();
    });

    it("waits for a courier, then shows when the assigned courier comes to the store", async () => {
      renderPage([
        deliveryOrder(4, "Confirmed"),
        deliveryOrder(5, "Confirmed", { status: "COURIER_ASSIGNED", courier_name: "Edin Mujić", courier_phone: "062 345 678", courier_assigned_at: at(13, 50) }),
      ]);
      await screen.findAllByText("Grožđe 2 kg");

      expect(stepStates("K4PM")).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
      // Waiting for a courier: a grey dot with the line green up to it, grey after it.
      expect(markers("K4PM")).toEqual(["done", "done", "pending", "upcoming", "upcoming"]);
      expect(lines("K4PM")).toEqual(["true", "true", "false", "false"]);
      expect(steps("K4PM").getByText(t("myOrders.steps.waitingCourier"))).toBeInTheDocument();

      expect(stepStates("K5PM")).toEqual(["done", "done", "done", "current", "upcoming"]);
      expect(steps("K5PM").getByText("dolazi u 14:05")).toBeInTheDocument();
    });

    it("marks a delivery that failed before the pickup on Kurir dodijeljen, with the note", async () => {
      renderPage([deliveryOrder(6, "Confirmed", { status: "FAILED", failure_reason: "No courier", price: "3.00", failed_at: at(12, 20) })]);
      await screen.findByText("Grožđe 2 kg");

      expect(stepStates("K6PM")).toEqual(["done", "done", "failed", "upcoming", "upcoming"]);
      const failed = steps("K6PM").getAllByTestId("order-step")[2]!;
      expect(failed).toHaveTextContent(t("myOrders.steps.failed"));
      expect(failed).toHaveTextContent("12:20");
      expect(within(card("K6PM")).getByTestId("delivery-failed-note")).toHaveTextContent(
        t("myOrders.card.failedNote", { reason: t("orders.delivery.failure.courier") }),
      );
      expect(within(card("K6PM")).getByTestId("order-when")).toHaveTextContent(t("myOrders.card.failed"));
      expect(within(card("K6PM")).getByTestId("order-when")).toHaveClass("text-danger-700");
    });

    it("marks a delivery that failed after the pickup on Isporučeno, without the restaurant's choice", async () => {
      renderPage([
        deliveryOrder(7, "InDelivery", { status: "FAILED", courier_assigned_at: at(13, 20), picked_up_at: at(13, 58), failed_at: at(14, 30) }),
      ]);
      await screen.findByText("Grožđe 2 kg");
      expect(stepStates("K7PM")).toEqual(["done", "done", "done", "done", "failed"]);
      expect(steps("K7PM").getAllByTestId("order-step").at(-1)).toHaveTextContent(t("myOrders.steps.failed"));
      expect(within(card("K7PM")).queryByTestId("delivery-failed-note")).not.toBeInTheDocument();
    });

    it("fills the success seal once the order is done", async () => {
      renderPage([order(8, "Hljeb", { status: "Completed", decided_at: at(10, 0), picked_up_at: at(11, 0), accepted_count: 1 })]);
      await screen.findByText("Hljeb 2 kg");
      expect(stepStates("K8PM")).toEqual(["done", "done", "done", "done"]);
    });

    it("strikes the old total through after a partial acceptance", async () => {
      renderPage([
        makeOrder({
          id: 9,
          code: "SX6Z",
          status: "Confirmed",
          created_at: at(11, 15),
          decided_at: at(11, 40),
          pickup_at: at(10, 0, 1),
          is_partial: true,
          item_count: 2,
          accepted_count: 1,
          ordered_total: "10.40",
          total: "4.80",
          items: [
            makeOrderItem({ id: 1, product_name: "Hljeb", quantity: "2", ordered_quantity: "2", unit_price: "2.40", status: "Confirmed" }),
            makeOrderItem({ id: 2, product_name: "Tikvice", status: "Rejected", change_reason: "NOT_ENOUGH_STOCK" }),
          ],
        }),
      ]);
      await screen.findByText(/Hljeb 2 kg/);
      expect(within(card("SX6Z")).getByTestId("old-total")).toHaveTextContent("10,40 KM");
      expect(within(card("SX6Z")).getByTestId("old-total")).toHaveClass("line-through");
      expect(within(card("SX6Z")).getByText("4,80 KM")).toBeInTheDocument();
      expect(within(card("SX6Z")).getByTestId("order-when")).toHaveTextContent("Sutra · 10:00");
      expect(within(card("SX6Z")).getByTestId("order-status")).toHaveTextContent(t("orders.partiallyAccepted"));
    });
  });

  describe("the late rule", () => {
    it("a pickup from today past its time is not late; one from yesterday is", async () => {
      renderPage([
        // The server's is_overdue: false while the pickup day is today, true from the next day.
        order(10, "Jaja", { status: "Confirmed", decided_at: at(9, 0), pickup_at: at(10, 0), is_overdue: false, accepted_count: 1 }),
        order(11, "Mlijeko", { status: "Confirmed", decided_at: at(10, 2, -1), pickup_at: at(13, 30, -1), is_overdue: true, accepted_count: 1 }),
      ]);
      await screen.findByText("Jaja 2 kg");

      expect(within(card("K10PM")).queryByTestId("late-badge")).not.toBeInTheDocument();
      // An accepted pickup on its day: a grey dot; a late one keeps the red ring.
      expect(markers("K10PM")).toEqual(["done", "done", "pending", "upcoming"]);
      expect(lines("K10PM")).toEqual(["true", "true", "false"]);
      expect(markers("K11PM")).toEqual(["done", "done", "ringDanger", "upcoming"]);
      expect(within(card("K10PM")).getByTestId("order-when")).toHaveTextContent("Danas · 10:00");
      expect(within(card("K10PM")).getByTestId("order-when")).not.toHaveClass("text-danger-700");

      expect(within(card("K11PM")).getByTestId("late-badge")).toHaveTextContent(t("pickups.overdueToday"));
      expect(steps("K11PM").getByText("Kasni · bilo jučer u 13:30")).toBeInTheDocument();
      expect(within(card("K11PM")).getByTestId("order-when")).toHaveTextContent("Jučer · 13:30");
      expect(within(card("K11PM")).getByTestId("order-when")).toHaveClass("text-danger-700");
    });
  });

  describe("step info", () => {
    it("is only on the steps reached, on hover and on focus, and Escape hides it", async () => {
      renderPage([
        deliveryOrder(12, "InDelivery", {
          status: "PICKED_UP",
          courier_name: "Amir Hodžić",
          courier_phone: "061 222 333",
          courier_assigned_at: at(13, 20),
          picked_up_at: at(13, 58),
        }),
        order(13, "Šljive", { auto_reject_at: at(15, 2), accept_partial: true }),
      ]);
      await screen.findByText("Grožđe 2 kg");

      // The pending order: Naručeno and Čeka odgovor are buttons, the steps ahead are not.
      expect(steps("K13PM").getAllByRole("button")).toHaveLength(2);
      expect(steps("K13PM").queryByRole("tooltip")).not.toBeInTheDocument();

      const pickedUp = steps("K12PM").getByRole("button", { name: /Kurir preuzeo/ });
      // The line and the text do not open it; only the dot does.
      await userEvent.hover(within(pickedUp).getByTestId("step-line"));
      expect(steps("K12PM").queryByRole("tooltip")).not.toBeInTheDocument();
      await userEvent.hover(within(pickedUp).getByText("Kurir preuzeo"));
      expect(steps("K12PM").queryByRole("tooltip")).not.toBeInTheDocument();
      const dot = within(pickedUp).getByTestId("step-marker");
      await userEvent.hover(dot);
      const tip = steps("K12PM").getByRole("tooltip");
      expect(pickedUp).toHaveAttribute("aria-describedby", tip.id);
      expect(tip).toHaveTextContent("Preuzeo robu u 13:58 (spremno je bilo u 13:30).");
      expect(tip).toHaveTextContent("Nosi: Grožđe 2 kg");
      expect(tip).toHaveTextContent("Pri dolasku kuriru plaćate 12,90 KM gotovinom.");
      expect(tip).toHaveTextContent("Kurir: Amir Hodžić · 061 222 333");
      await userEvent.unhover(dot);
      expect(steps("K12PM").queryByRole("tooltip")).not.toBeInTheDocument();
      // The current step after the third (on the way) has no info.
      expect(steps("K12PM").getAllByRole("button")).toHaveLength(4);

      const accepted = steps("K12PM").getByRole("button", { name: /Prihvaćeno/ });
      act(() => accepted.focus());
      expect(steps("K12PM").getByRole("tooltip")).toHaveTextContent("Dostava 3,00 KM · kuriru plaćate 12,90 KM gotovinom");
      fireEvent.keyDown(accepted, { key: "Escape" });
      expect(steps("K12PM").queryByRole("tooltip")).not.toBeInTheDocument();

      const waiting = steps("K13PM").getByRole("button", { name: /Čeka odgovor/ });
      act(() => waiting.focus());
      expect(steps("K13PM").getByRole("tooltip")).toHaveTextContent("Prodavnica treba odgovoriti do 15:02.");
      expect(steps("K13PM").getByRole("tooltip")).toHaveTextContent("Ako ne odgovori, narudžba se automatski odbija.");
      const sent = steps("K13PM").getByRole("button", { name: /Naručeno/ });
      act(() => sent.focus());
      expect(steps("K13PM").getByRole("tooltip")).toHaveTextContent("Djelimično prihvatanje: dozvoljeno");
    });

    it("tells about a late pickup and a failed delivery", async () => {
      renderPage([
        order(14, "Mlijeko", {
          status: "Confirmed",
          decided_at: at(10, 2, -1),
          pickup_at: at(13, 30, -1),
          is_overdue: true,
          accepted_count: 1,
          party_address: "Zmaja od Bosne 8",
        }),
        deliveryOrder(15, "Confirmed", { status: "FAILED", failure_reason: "No courier", failed_at: at(12, 20) }),
      ]);
      await screen.findByText("Mlijeko 2 kg");

      act(() => steps("K14PM").getByRole("button", { name: /Preuzimanje/ }).focus());
      const late = steps("K14PM").getByRole("tooltip");
      expect(late).toHaveTextContent("Termin je bio jučer u 13:30 (kasni 1 dan).");
      expect(late).toHaveTextContent("Adresa: Zmaja od Bosne 8, Sarajevo");
      expect(late).toHaveTextContent(t("myOrders.info.storeMayCancel"));

      act(() => steps("K15PM").getByRole("button", { name: /Dostava nije uspjela/ }).focus());
      const failed = steps("K15PM").getByRole("tooltip");
      expect(failed).toHaveTextContent("Javljeno danas u 12:20");
      expect(failed).toHaveTextContent(`Razlog: ${t("orders.delivery.failure.courier")}.`);
      expect(failed).toHaveTextContent(t("myOrders.info.failedBeforeNext"));
    });
  });

  describe("History", () => {
    const history = [
      order(31, "Jogurt", { code: "TMWS", status: "Rejected", created_at: at(17, 46, -1), ordered_total: "12.30", total: "0.00" }),
      order(30, "Orada", {
        code: "3RU9",
        status: "Completed",
        created_at: at(17, 39, -2),
        is_partial: true,
        item_count: 3,
        accepted_count: 2,
        ordered_total: "26.40",
        total: "20.60",
      }),
      order(29, "Kajmak", { code: "PGCZ", status: "Completed", fulfilment_method: "DELIVERY", created_at: at(13, 51, -2), total: "13.40" }),
    ];
    const renderHistory = (total?: number) => renderPage((params) => (params.scope === "all" ? history : [order(1, "Aktivna")]), total);
    const table = () => screen.getByRole("table", { name: t("myOrders.history.table") });

    it("loads every status newest first, 20 at a time, as a table grouped by the day sent", async () => {
      renderHistory();
      await screen.findByText("Aktivna 2 kg");
      await userEvent.click(tab("history"));
      await within(await screen.findByRole("table")).findByText("#TMWS");

      expect(lastListParams()).toMatchObject({ scope: "all", sort: "newest", limit: 20 });
      const headings = within(table()).getAllByRole("columnheader").map((cell) => cell.textContent);
      expect(headings).toEqual(expect.arrayContaining(["Narudžba", "Prodavnica", "Proizvodi", "Način", "Ukupno", "Status"]));
      expect(within(table()).getByText(t("notifications.groups.yesterday"))).toBeInTheDocument();
      expect(within(table()).getByText("1 narudžba")).toBeInTheDocument();
      expect(within(table()).getByText("2 narudžbe")).toBeInTheDocument();

      // Each day's heading: a calendar leaf (month and day), the title, and the full date under "Jučer".
      const days = within(table()).getAllByTestId("day-heading");
      expect(days).toHaveLength(2);
      expect(within(days[0]!).getByTestId("day-leaf")).toHaveTextContent("OKT19");
      expect(within(days[0]!).getByTestId("day-title")).toHaveTextContent(t("notifications.groups.yesterday"));
      expect(within(days[0]!).getByTestId("day-date")).toHaveTextContent(fullDate("2026-10-19", t));
      expect(within(days[1]!).getByTestId("day-leaf")).toHaveTextContent("OKT18");
      expect(within(days[1]!).getByTestId("day-title")).toHaveTextContent(fullDate("2026-10-18", t));
      expect(within(days[1]!).queryByTestId("day-date")).not.toBeInTheDocument();

      // A rejected order: the sent total struck through, not 0.00.
      const rejected = within(screen.getByTestId("history-row-31"));
      expect(rejected.getByTestId("history-total")).toHaveTextContent("12,30 KM");
      expect(rejected.getByTestId("history-total")).toHaveClass("line-through");
      // A reduced one: the new total with the old one struck under it, and "2/3 prihvaćeno".
      const partial = within(screen.getByTestId("history-row-30"));
      expect(partial.getByTestId("history-total")).toHaveTextContent("20,60 KM");
      expect(partial.getByText("26,40 KM")).toHaveClass("line-through");
      expect(partial.getByText("2/3 prihvaćeno")).toBeInTheDocument();
      expect(within(screen.getByTestId("history-row-29")).getByText(t("myOrders.method.delivery"))).toBeInTheDocument();
      expect(within(screen.getByTestId("history-row-29")).getByTestId("order-status")).toHaveTextContent(t("orders.statusDelivered"));
      expect(partial.getByRole("link", { name: t("storePage.orders.detailsLabel", { code: "#3RU9" }) })).toHaveAttribute(
        "href",
        "/orders/30",
      );
      expect(screen.queryByRole("button", { name: /Otkaži/ })).not.toBeInTheDocument();
    });

    it("shows Prikazano N od M and loads 20 more with Prikaži još", async () => {
      renderHistory(65);
      await screen.findByText("Aktivna 2 kg");
      await userEvent.click(tab("history"));
      await within(await screen.findByRole("table")).findByText("#TMWS");

      expect(screen.getByText(t("common.showingOf", { shown: 3, total: 65 }))).toBeInTheDocument();
      // The last day may continue on the next page.
      expect(within(table()).getByText("2+ narudžbe")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("myOrders.showMore") }));
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", limit: 40 }));
    });

    it("shows the loading state, not the Active list, while History loads, and ignores a late Active response", async () => {
      // Each list request waits until the test answers it.
      const pending: { scope: unknown; respond: () => void }[] = [];
      renderWithProviders(<MyOrdersPage />, {
        route: "/my-orders",
        path: "/my-orders",
        user: makeUser(),
        get: {
          "/orders/mine": (params: unknown) => {
            const { scope } = params as { scope: string };
            const list = scope === "all" ? history : [order(1, "Aktivna")];
            return new Promise((resolve) => {
              pending.push({ scope, respond: () => resolve({ orders: list, total: list.length }) });
            });
          },
          "/orders/mine/summary": { summary: SUMMARY },
        },
      });
      const respond = async (scope: string) => {
        await waitFor(() => expect(pending.some((p) => p.scope === scope)).toBe(true));
        pending.splice(pending.findIndex((p) => p.scope === scope), 1)[0]!.respond();
      };

      await respond("active");
      await screen.findByText("Aktivna 2 kg");

      await userEvent.click(tab("history"));
      expect(screen.queryByText("Aktivna 2 kg")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();

      // Back to Active and to History again; the first History answer arrives after the second Active one.
      await waitFor(() => expect(pending.some((p) => p.scope === "all")).toBe(true));
      await userEvent.click(tab("active"));
      await respond("active");
      await respond("all");
      expect(await screen.findByText("Aktivna 2 kg")).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText("#TMWS")).not.toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it("no active orders: Pogledaj historiju and the link to Search", async () => {
      renderPage([]);
      expect(await screen.findByText(t("orders.activeEmptyTitle"))).toBeInTheDocument();
      expect(screen.getByRole("link", { name: t("dashboard.browseOffers") })).toHaveAttribute("href", "/search");
      await userEvent.click(screen.getByRole("button", { name: t("orders.showHistory") }));
      expect(tab("history")).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByText(t("orders.historyEmptyTitle"))).toBeInTheDocument();
    });

    it("no results for the search: Očisti filtere", async () => {
      renderPage((params) => (params.q ? [] : [order(1)]));
      await screen.findByText("Piletina 2 kg");
      await userEvent.type(searchField(), "nema");
      expect(await screen.findByText(t("orders.noResultsTitle"))).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
      expect(searchField()).toHaveValue("");
      expect(await screen.findByText("Piletina 2 kg")).toBeInTheDocument();
    });
  });

  describe("cancelling", () => {
    const cancelButton = () => screen.getByRole("button", { name: t("myOrders.card.cancelLabel", { code: "#K5PM" }) });

    it("cancels an order after confirmation and reloads the list and the summary", async () => {
      const success = vi.spyOn(toast, "success");
      apiMock.post.mockResolvedValue({ data: { message: "Order cancelled." } });
      renderPage([order(5, "Piletina", { status: "Pending" })]);

      await screen.findByText("Piletina 2 kg");
      await userEvent.click(cancelButton());
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: t("orders.cancelButton") }));

      expect(apiMock.post).toHaveBeenCalledWith("/orders/5/cancel");
      expect(success).toHaveBeenCalledWith("Order cancelled.");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(listCalls()).toHaveLength(2);
      expect(summaryCalls()).toHaveLength(2);
    });

    it("keeps the order when the user changes their mind", async () => {
      renderPage([order(5, "Piletina", { status: "Pending" })]);
      await screen.findByText("Piletina 2 kg");
      await userEvent.click(cancelButton());
      await userEvent.click(screen.getByRole("button", { name: t("orders.keepButton") }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(apiMock.post).not.toHaveBeenCalled();
      expect(cancelButton()).toBeInTheDocument();
    });

    it("shows the server error when cancelling fails", async () => {
      const error = vi.spyOn(toast, "error");
      vi.spyOn(console, "error").mockImplementation(() => {});
      apiMock.post.mockRejectedValue(axiosError(400, "Only pending orders can be cancelled."));
      renderPage([order(5, "Piletina", { status: "Pending" })]);

      await screen.findByText("Piletina 2 kg");
      await userEvent.click(cancelButton());
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("orders.cancelButton") }));

      expect(error).toHaveBeenCalledWith("Only pending orders can be cancelled.");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
