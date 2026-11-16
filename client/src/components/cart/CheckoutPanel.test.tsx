import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import CheckoutPanel from "./CheckoutPanel.js";
import { apiMock, makeCart, renderWithProviders, t } from "../../test/utils.js";
import type { CartDelivery } from "../../types/index.js";

const ESTIMATE: CartDelivery = {
  available: true,
  price: "9.10",
  estimated_pickup_at: new Date(2026, 10, 16, 12, 5).toISOString(),
  estimated_delivery_at: new Date(2026, 10, 16, 12, 36).toISOString(),
};

const renderPanel = (delivery: CartDelivery | Error = ESTIMATE) => {
  const onSent = vi.fn();
  // makeCart: one line of 2 × 5.00 KM, total 10.00 KM.
  renderWithProviders(<CheckoutPanel cart={makeCart()} onSent={onSent} onNotSent={vi.fn()} />, {
    get: { "/cart/delivery": delivery instanceof Error ? delivery : { delivery } },
  });
  return { onSent };
};

const chooseDelivery = () => userEvent.click(screen.getByLabelText(t("cart.method.delivery")));
const sendButton = () => screen.getByRole("button", { name: t("orders.send.submit") });

describe("CheckoutPanel delivery", () => {
  it("starts with pickup and its date and time", async () => {
    renderPanel();
    expect(screen.getByLabelText(t("cart.method.pickup"))).toBeChecked();
    expect(screen.getByText(t("orderForm.pickupTime"))).toBeInTheDocument();
    await waitFor(() => expect(apiMock.get).not.toHaveBeenCalledWith("/cart/delivery"));
  });

  it("shows the estimate and sends a delivery order without a pickup time", async () => {
    const { onSent } = renderPanel();
    await chooseDelivery();
    expect(apiMock.get).toHaveBeenCalledWith("/cart/delivery");
    const estimate = await screen.findByTestId("delivery-estimate");
    expect(estimate).toHaveTextContent(t("cart.delivery.arrives", { time: "12:36" }));
    expect(within(estimate).getByText("9.10 KM")).toBeInTheDocument();
    // Goods 10.00 + delivery 9.10, in cash to the courier.
    expect(within(estimate).getByText("19.10 KM")).toBeInTheDocument();
    expect(screen.queryByText(t("orderForm.pickupTime"))).not.toBeInTheDocument();

    const order = {
      id: 7,
      code: "K7PM",
      fulfilment_method: "DELIVERY",
      pickup_at: "2026-11-16T12:05:00",
      delivery_fee_estimate: "9.10",
      delivery_estimated_at: ESTIMATE.estimated_delivery_at,
      items: [],
    };
    apiMock.post.mockResolvedValueOnce({ data: { order, changes: [] } });
    await userEvent.click(sendButton());
    expect(apiMock.post).toHaveBeenCalledWith("/orders", {
      fulfilment_method: "DELIVERY",
      accept_partial: true,
      items: [{ product_id: 1, quantity: 2, unit_price: "5.00" }],
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledWith({ order, changes: [] }));
  });

  it("says why delivery is not possible, links to the map without a pin, and cannot send", async () => {
    renderPanel({ available: false, reason: "RESTAURANT_NO_LOCATION" });
    await chooseDelivery();
    const note = await screen.findByTestId("delivery-unavailable");
    expect(note).toHaveTextContent(t("cart.delivery.reasons.RESTAURANT_NO_LOCATION"));
    expect(within(note).getByRole("link", { name: t("location.reminderLink") })).toHaveAttribute(
      "href",
      "/my-profile#location",
    );
    expect(sendButton()).toBeDisabled();
  });

  it("shows the reason when sending finds delivery no longer possible", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errorToast = vi.spyOn(toast, "error");
    renderPanel();
    await chooseDelivery();
    await screen.findByTestId("delivery-estimate");
    apiMock.post.mockRejectedValueOnce(
      new AxiosError("Request failed", "409", undefined, undefined, {
        status: 409,
        statusText: "",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { error: "Dostava nije moguća za ovu narudžbu.", code: "DELIVERY_UNAVAILABLE", reason: "STORE_CLOSED" },
      }),
    );
    await userEvent.click(sendButton());
    expect(await screen.findByTestId("delivery-unavailable")).toHaveTextContent(t("cart.delivery.reasons.STORE_CLOSED"));
    expect(errorToast).toHaveBeenCalledWith("Dostava nije moguća za ovu narudžbu.");
    expect(sendButton()).toBeDisabled();
  });

  it("says when delivery cannot be checked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel(new Error("Network Error"));
    await chooseDelivery();
    expect(await screen.findByText(t("cart.delivery.error"))).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });
});
