import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import OrderDecisionModal from "./OrderDecisionModal.js";
import { apiMock, axiosError, makeOrder, makeOrderItem, t } from "../../test/utils.js";
import type { Order } from "../../types/index.js";

// Piletina 20 kg at 3.50 (70 KM) and Mlijeko 10 l at 1.40 (14 KM).
const ORDER = makeOrder({
  id: 8,
  code: "K7PM",
  items: [
    makeOrderItem({ id: 41, product_id: 1, product_name: "Piletina", quantity: "20", ordered_quantity: "20", unit_price: "3.50" }),
    makeOrderItem({ id: 42, product_id: 2, product_name: "Mlijeko", unit: "l", quantity: "10", ordered_quantity: "10", unit_price: "1.40" }),
  ],
});

const renderModal = (order: Order = ORDER) => {
  const onClose = vi.fn();
  const onDecided = vi.fn();
  render(<OrderDecisionModal order={order} restaurant="Restoran Ukus" onClose={onClose} onDecided={onDecided} />);
  return { onClose, onDecided };
};

const line = (product: string) =>
  screen.getAllByTestId("decision-line").find((element) => within(element).queryByText(product))!;
const choose = (product: string, action: "ACCEPT" | "ACCEPT_LESS" | "REJECT") =>
  userEvent.click(within(line(product)).getByRole("radio", { name: t(`orders.decision.actions.${action}`) }));
const reasonOf = (product: string) => within(line(product)).getByLabelText(t("orders.decision.reason"));
const button = (key: string) => screen.getByRole("button", { name: t(key) });

describe("OrderDecisionModal", () => {
  it("accepts every item after the summary", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order decision saved." } });
    const success = vi.spyOn(toast, "success");
    const { onClose, onDecided } = renderModal();

    expect(screen.getByRole("heading", { name: t("orders.decision.title", { code: "#K7PM" }) })).toBeInTheDocument();
    expect(screen.getByTestId("decision-total")).toHaveTextContent(t("orders.decision.total", { total: "84.00 KM" }));
    await userEvent.click(button("orders.decision.confirmDecision"));
    expect(screen.getByText(t("orders.decision.summaryAll", { count: 2, total: "84.00 KM" }))).toBeInTheDocument();
    await userEvent.click(button("orders.decision.save"));

    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/decision", {
      items: [
        { item_id: 41, action: "ACCEPT" },
        { item_id: 42, action: "ACCEPT" },
      ],
    });
    expect(success).toHaveBeenCalledWith("Order decision saved.");
    expect(onClose).toHaveBeenCalled();
    expect(onDecided).toHaveBeenCalled();
  });

  it("accepts less with a shop sale and rejects an item with a note, showing the new total", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order decision saved." } });
    renderModal();

    await choose("Piletina", "ACCEPT_LESS");
    await userEvent.type(within(line("Piletina")).getByLabelText(t("orders.decision.acceptedQuantity", { product: "Piletina" })), "15");
    await userEvent.selectOptions(reasonOf("Piletina"), t("orders.reasonLabels.NOT_ENOUGH_STOCK"));
    await userEvent.click(within(line("Piletina")).getByRole("checkbox", { name: t("orders.decision.recordSale") }));
    // Prefilled with the difference.
    expect(within(line("Piletina")).getByLabelText(t("orders.decision.saleQuantity"))).toHaveValue(5);

    await choose("Mlijeko", "REJECT");
    await userEvent.selectOptions(reasonOf("Mlijeko"), t("orders.reasonLabels.OTHER"));
    await userEvent.type(within(line("Mlijeko")).getByLabelText(t("orders.decision.note")), "Ambalaža oštećena");

    expect(screen.getByTestId("decision-total")).toHaveTextContent(
      t("orders.decision.newTotal", { total: "52.50 KM", ordered: "84.00 KM" }),
    );
    await userEvent.click(button("orders.decision.confirmDecision"));
    expect(
      screen.getByText(t("orders.decision.summary", { accepted: 0, reduced: 1, rejected: 1, total: "52.50 KM" })),
    ).toBeInTheDocument();
    await userEvent.click(button("orders.decision.save"));

    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/decision", {
      items: [
        { item_id: 41, action: "ACCEPT_LESS", quantity: 15, reason: "NOT_ENOUGH_STOCK", record_shop_sale: 5 },
        { item_id: 42, action: "REJECT", reason: "OTHER", note: "Ambalaža oštećena" },
      ],
    });
  });

  it("asks for a reason, a note for Other and a quantity below the ordered one", async () => {
    renderModal();
    await choose("Piletina", "ACCEPT_LESS");
    await userEvent.type(within(line("Piletina")).getByLabelText(t("orders.decision.acceptedQuantity", { product: "Piletina" })), "20");
    await choose("Mlijeko", "REJECT");
    await userEvent.click(button("orders.decision.confirmDecision"));

    expect(within(line("Piletina")).getByText(t("orders.decision.errors.quantity"))).toBeInTheDocument();
    expect(within(line("Mlijeko")).getByText(t("orders.decision.errors.reason"))).toBeInTheDocument();
    await userEvent.selectOptions(reasonOf("Mlijeko"), t("orders.reasonLabels.OTHER"));
    expect(within(line("Mlijeko")).getByText(t("orders.decision.errors.note"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("rejects the whole order with a reason and the shop sales", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order decision saved." } });
    renderModal();

    await userEvent.click(button("orders.decision.rejectOrder"));
    expect(screen.getByRole("heading", { name: t("orders.decision.rejectTitle", { code: "#K7PM" }) })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t("orders.decision.reason")), t("orders.reasonLabels.NOT_ENOUGH_STOCK"));
    await userEvent.click(screen.getByRole("checkbox", { name: t("orders.decision.recordSaleOf", { product: "Mlijeko" }) }));
    await userEvent.click(screen.getAllByRole("button", { name: t("orders.decision.rejectOrder") }).at(-1)!);
    expect(screen.getByText(t("orders.decision.summaryReject", { code: "#K7PM" }))).toBeInTheDocument();
    await userEvent.click(button("orders.decision.saveReject"));

    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/decision", {
      reject_order: true,
      reason: "NOT_ENOUGH_STOCK",
      shop_sales: [{ product_id: 2, quantity: 10 }],
    });
  });

  it("offers only accepting or rejecting the whole order when partial fulfilment is off", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order decision saved." } });
    renderModal({ ...ORDER, accept_partial: false });

    expect(screen.getByText(t("orders.decision.wholeOnly"))).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(button("orders.decision.acceptAll"));
    await userEvent.click(button("orders.decision.save"));
    expect(apiMock.post).toHaveBeenCalledWith("/orders/8/decision", {
      items: [
        { item_id: 41, action: "ACCEPT" },
        { item_id: 42, action: "ACCEPT" },
      ],
    });
  });

  it("keeps the dialog open and shows the server's error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(400, "An expired product cannot be accepted."));
    const { onClose } = renderModal();

    await userEvent.click(button("orders.decision.confirmDecision"));
    await userEvent.click(button("orders.decision.save"));
    expect(error).toHaveBeenCalledWith("An expired product cannot be accepted.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
