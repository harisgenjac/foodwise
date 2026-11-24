import { screen, within } from "@testing-library/react";
import DevTrackingPage from "./DevTrackingPage.js";
import { axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { MockTracking } from "../../types/index.js";

const restaurant = makeUser({ id: 1, role: "RESTAURANT", business_name: "Restoran Ukus" });

const TRACKING: MockTracking = {
  delivery: {
    delivery_id: "mock_dlv_1",
    order_id: 20,
    order_code: "K7PM",
    delivery_address: "Butmirska 2, Sarajevo",
    store_name: "Market Centar",
    restaurant_name: "Restoran Ukus",
    status: "DELIVERED",
    ready_at: "2030-01-02T10:00:00.000Z",
    estimated_pickup_at: "2030-01-02T10:05:00.000Z",
    estimated_delivery_at: "2030-01-02T10:40:00.000Z",
    courier_name: "Selma Mehmedović",
    courier_phone: "+38762000000",
    courier_photo_url: "http://localhost:5173/dev/couriers/courier-2.svg",
    courier_vehicle: "SCOOTER",
    courier_assigned_at: "2030-01-02T09:58:00.000Z",
    picked_up_at: "2030-01-02T10:06:00.000Z",
    delivered_at: "2030-01-02T10:40:00.000Z",
    failed_at: null,
    failure_code: null,
    failure_reason: null,
    tracking_url: "http://localhost:5173/dev/tracking/mock_dlv_1",
  },
  history: [
    {
      id: 1,
      type: "delivery.courier_assigned",
      occurred_at: "2030-01-02T09:58:00.000Z",
      applied: true,
      estimated_pickup_at: "2030-01-02T10:05:00.000Z",
      estimated_delivery_at: "2030-01-02T10:36:00.000Z",
      failure_code: null,
    },
    {
      id: 2,
      type: "delivery.estimate_updated",
      occurred_at: "2030-01-02T10:10:00.000Z",
      applied: true,
      estimated_pickup_at: "2030-01-02T10:05:00.000Z",
      estimated_delivery_at: "2030-01-02T10:41:00.000Z",
      failure_code: null,
    },
    {
      id: 3,
      type: "delivery.courier_assigned",
      occurred_at: "2030-01-02T09:59:00.000Z",
      applied: false,
      estimated_pickup_at: null,
      estimated_delivery_at: null,
      failure_code: null,
    },
  ],
  ratings: [{ rating: 5, comment: "Brz i ljubazan.", received_at: "2030-01-02T11:00:00.000Z" }],
};

const renderPage = (response: MockTracking | Error = TRACKING) =>
  renderWithProviders(<DevTrackingPage />, {
    route: "/dev/tracking/mock_dlv_1",
    path: "/dev/tracking/:deliveryId",
    user: restaurant,
    get: { "/delivery/mock/deliveries/mock_dlv_1": response },
  });

describe("DevTrackingPage", () => {
  it("shows the courier with photo and vehicle, the status, the history and the ratings", async () => {
    renderPage();
    const page = await screen.findByTestId("dev-tracking");
    // The status, and the time it was delivered.
    expect(within(page).getAllByText(t("orders.delivery.status.DELIVERED"))).toHaveLength(2);
    expect(within(page).getByRole("img", { name: "Selma Mehmedović" })).toHaveAttribute(
      "src",
      "http://localhost:5173/dev/couriers/courier-2.svg",
    );
    expect(within(page).getByText(t("orders.delivery.vehicles.SCOOTER"))).toBeInTheDocument();
    expect(within(page).getByRole("link", { name: "+38762000000" })).toHaveAttribute("href", "tel:+38762000000");

    const history = within(page).getByRole("list", { name: t("orders.tracking.history") });
    expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    expect(within(history).getByText(t("orders.tracking.events.estimate_updated"))).toBeInTheDocument();
    expect(within(history).getByText(t("orders.tracking.ignored"))).toBeInTheDocument();

    expect(within(page).getByText("5/5")).toBeInTheDocument();
    expect(within(page).getByText("· Brz i ljubazan.", { exact: false })).toBeInTheDocument();
  });

  it("shows a failure with its reason, and a delivery without a courier yet", async () => {
    renderPage({
      ...TRACKING,
      delivery: {
        ...TRACKING.delivery,
        status: "FAILED",
        courier_name: null,
        courier_phone: null,
        courier_photo_url: null,
        courier_vehicle: null,
        picked_up_at: null,
        delivered_at: null,
        failed_at: "2030-01-02T10:20:00.000Z",
        failure_code: "NO_COURIER",
        failure_reason: "No courier was available.",
      },
      ratings: [],
    });
    const page = await screen.findByTestId("dev-tracking");
    expect(within(page).getByText(t("orders.delivery.failure.NO_COURIER"), { exact: false })).toBeInTheDocument();
    expect(within(page).getByText(t("orders.tracking.noCourier"))).toBeInTheDocument();
    expect(within(page).getByText(t("orders.tracking.noRatings"))).toBeInTheDocument();
  });

  it("says when the delivery is not found", async () => {
    renderPage(axiosError(404, "Dostava nije pronađena."));
    expect(await screen.findByText(t("orders.tracking.notFound"))).toBeInTheDocument();
  });
});
