import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockCourierPanel from "./MockCourierPanel.js";
import { apiMock, axiosError, t } from "../../test/utils.js";
import type { OrderDelivery } from "../../types/index.js";

const delivery = (overrides: Partial<OrderDelivery> = {}): OrderDelivery => ({
  status: "CREATED",
  price: "9.40",
  cash_to_collect: "61.90",
  estimated_pickup_at: "2026-11-16T12:05:00.000Z",
  estimated_delivery_at: "2026-11-16T12:36:00.000Z",
  courier_name: null,
  courier_phone: null,
  tracking_url: null,
  failure_code: null,
  failure_reason: null,
  picked_up_at: null,
  ...overrides,
});

const renderPanel = (value: OrderDelivery, onDone = vi.fn()) => {
  render(<MockCourierPanel orderId={8} delivery={value} onDone={onDone} />);
  return onDone;
};

const button = (key: string) => screen.getByRole("button", { name: t(key) });

beforeEach(() => {
  apiMock.post.mockResolvedValue({ data: { message: "Courier step simulated." } });
});

describe("MockCourierPanel", () => {
  it("assigns a courier with a photo, or without one", async () => {
    const onDone = renderPanel(delivery());
    await userEvent.click(button("orders.mockCourier.steps.courier_assigned"));
    expect(apiMock.post).toHaveBeenCalledWith("/delivery/mock/orders/8/simulate", { event: "courier_assigned", photo: true });
    expect(onDone).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox", { name: t("orders.mockCourier.withPhoto") }));
    await userEvent.click(button("orders.mockCourier.steps.courier_assigned"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", { event: "courier_assigned", photo: false });
  });

  it("moves the arrival estimate by 5 minutes either way", async () => {
    renderPanel(delivery({ status: "COURIER_ASSIGNED" }));
    await userEvent.click(button("orders.mockCourier.steps.estimate_later"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", { event: "estimate", minutes: 5 });
    await userEvent.click(button("orders.mockCourier.steps.estimate_earlier"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", { event: "estimate", minutes: -5 });
  });

  it("fails with a chosen code before the pickup, and after it", async () => {
    renderPanel(delivery({ status: "COURIER_ASSIGNED" }));
    expect(screen.queryByRole("button", { name: t("orders.mockCourier.failAfter") })).not.toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: t("orders.mockCourier.failureCode") });
    // Every code of the delivery service can be chosen.
    expect(screen.getAllByRole("option")).toHaveLength(5);
    await userEvent.selectOptions(select, "RECIPIENT_CLOSED");
    await userEvent.click(button("orders.mockCourier.failBefore"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", {
      event: "failed",
      failure_code: "RECIPIENT_CLOSED",
    });
  });

  it("after the pickup offers the delivery, a failure after the pickup and no cancel", async () => {
    renderPanel(delivery({ status: "PICKED_UP", picked_up_at: "2026-11-16T12:06:00.000Z" }));
    expect(screen.queryByRole("button", { name: t("orders.mockCourier.steps.cancelled") })).not.toBeInTheDocument();
    await userEvent.click(button("orders.mockCourier.failAfter"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", { event: "failed", failure_code: "NO_COURIER" });
    await userEvent.click(button("orders.mockCourier.steps.delivered"));
    expect(apiMock.post).toHaveBeenLastCalledWith("/delivery/mock/orders/8/simulate", { event: "delivered" });
  });

  it("links to the tracking page, also once the delivery is closed", () => {
    const url = "http://localhost:5173/dev/tracking/mock_dlv_1";
    renderPanel(delivery({ status: "DELIVERED", tracking_url: url }));
    expect(screen.getByRole("link", { name: t("orders.mockCourier.tracking") })).toHaveAttribute("href", url);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows nothing for a closed delivery without a tracking page, or one that was never booked", () => {
    const { container } = render(
      <>
        <MockCourierPanel orderId={8} delivery={delivery({ status: "FAILED" })} onDone={vi.fn()} />
        <MockCourierPanel orderId={8} delivery={delivery({ price: null })} onDone={vi.fn()} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the server's refusal", async () => {
    apiMock.post.mockRejectedValue(axiosError(409, "Ovaj korak kurira sada nije moguć."));
    const onDone = renderPanel(delivery());
    await userEvent.click(button("orders.mockCourier.steps.cancelled"));
    expect(onDone).not.toHaveBeenCalled();
  });
});
