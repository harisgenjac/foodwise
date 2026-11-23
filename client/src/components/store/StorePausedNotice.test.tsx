import { screen } from "@testing-library/react";
import StorePausedNotice from "./StorePausedNotice.js";
import CheckoutPanel from "../cart/CheckoutPanel.js";
import { makeCart, renderWithProviders, t } from "../../test/utils.js";

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("StorePausedNotice", () => {
  it("says the store takes no orders, with the end of the pause", async () => {
    renderWithProviders(<StorePausedNotice pause={{ orders_paused: true, orders_paused_until: null }} />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      t("orderPause.notice", { until: t("orderPause.untilResumed") }),
    );
  });

  it("shows nothing without a pause or after it ended", async () => {
    const { container, rerender } = renderWithProviders(<StorePausedNotice pause={{ orders_paused: false, orders_paused_until: null }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StorePausedNotice pause={{ orders_paused: true, orders_paused_until: new Date(Date.now() - 1000).toISOString() }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StorePausedNotice pause={{ orders_paused: true, orders_paused_until: inAnHour() }} />);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("stops the checkout while the store is paused", async () => {
    const cart = makeCart();
    cart.store = { ...cart.store!, orders_paused: true, orders_paused_until: null };
    renderWithProviders(<CheckoutPanel cart={cart} onSent={vi.fn()} onNotSent={vi.fn()} />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      t("orderPause.notice", { until: t("orderPause.untilResumed") }),
    );
    expect(screen.getByRole("button", { name: t("orders.send.submit") })).toBeDisabled();
  });
});
