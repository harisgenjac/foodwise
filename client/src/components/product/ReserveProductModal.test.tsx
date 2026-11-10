import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import ReserveProductModal from "./ReserveProductModal.js";
import { apiMock, axiosError, makeProduct, t } from "../../test/utils.js";
import { toDateInput } from "../../utils/expiry.js";
import type { SendChange } from "../../types/index.js";

const product = makeProduct({ id: 7, available_quantity: "6.50", quantity: "10" });

// The server's answer to POST /orders: the order (3 kg at 5 KM) and what sending changed.
const sent = (changes: SendChange[] = [], items = [{ quantity: "3", unit_price: "5.00" }]) => ({
  data: { message: "Order sent.", order: { id: 50, code: "K7PM", items }, changes },
});
const SENT = sent();

// 409 ORDER_NOT_SENT with one problem line.
const notSent = (kind: string, available: number, unitPrice = 5) =>
  new AxiosError("Request failed", "409", undefined, undefined, {
    status: 409,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      error: "The order could not be sent.",
      code: "ORDER_NOT_SENT",
      lines: [{ product_id: 7, kind, requested: 3, available, unit_price: unitPrice }],
    },
  });

// The body of the one-item order the form sends.
const body = (overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
  pickup_at: "2030-01-01T10:00",
  accept_partial: true,
  items: [{ product_id: 7, quantity: 3, unit_price: "5.00", ...item }],
  ...overrides,
});

const renderModal = () => {
  const onClose = vi.fn();
  const onReserved = vi.fn();
  render(
    <MemoryRouter>
      <ReserveProductModal product={product} onClose={onClose} onReserved={onReserved} />
    </MemoryRouter>,
  );
  return { onClose, onReserved };
};

const dateField = () => screen.getByLabelText(t("myReservations.pickupDate"));
const timeField = () => screen.getByLabelText(t("myReservations.pickupTime"));
const quantityField = () => screen.getByLabelText(t("dashboard.quantity"), { exact: false });
const partialField = () => screen.getByRole("checkbox", { name: t("orders.send.acceptPartial") });
const submitButton = () => screen.getByRole("button", { name: t("orders.send.submit") });
const submit = () => userEvent.click(submitButton());

// Fills the form in page order; typing the quantity moves the focus out of the time field.
const fillForm = async ({ date = "01/01/2030", time = "10:00" } = {}) => {
  await userEvent.type(dateField(), date);
  await userEvent.type(timeField(), time);
  await userEvent.type(quantityField(), "3");
};

describe("ReserveProductModal", () => {
  it("shows the product, the store and the quantity still available", () => {
    renderModal();
    expect(screen.getByText("Piletina")).toBeInTheDocument();
    expect(screen.getByText("Market Centar · Sarajevo")).toBeInTheDocument();
    expect(screen.getByText(/6\.5/)).toBeInTheDocument();
    expect(quantityField()).toHaveAttribute("max", "6.50");
    expect(screen.getByRole("heading", { name: t("orders.send.title") })).toBeInTheDocument();
  });

  it("sends a one-item order at the shown price with partial fulfilment on, then shows its code", async () => {
    apiMock.post.mockResolvedValue(SENT);
    const { onClose, onReserved } = renderModal();

    expect(partialField()).toBeChecked();
    await fillForm();
    await submit();

    expect(apiMock.post).toHaveBeenCalledWith("/orders", body());
    expect(onReserved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: t("orders.send.sentTitle", { code: "#K7PM" }) })).toBeInTheDocument();
    expect(screen.getByText(t("orders.send.sentText", { total: "15.00 KM", store: "Market Centar" }))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("orders.send.toMyOrders") })).toHaveAttribute("href", "/my-orders");

    await userEvent.click(screen.getByRole("button", { name: t("orders.send.close") }));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends partial fulfilment off when the restaurant unticks it", async () => {
    apiMock.post.mockResolvedValue(SENT);
    renderModal();
    await fillForm();
    await userEvent.click(partialField());
    await submit();
    expect(apiMock.post).toHaveBeenCalledWith("/orders", body({ accept_partial: false }));
  });

  it("lists what sending changed", async () => {
    apiMock.post.mockResolvedValue(
      sent(
        [{ product_id: 7, name: "Piletina", unit: "kg", kind: "QUANTITY_REDUCED", requested: 3, sent: 2, old_price: 5, new_price: 5 }],
        [{ quantity: "2", unit_price: "5.00" }],
      ),
    );
    renderModal();
    await fillForm();
    await submit();

    expect(screen.getByText(t("orders.sendChangesTitle"))).toBeInTheDocument();
    expect(screen.getByText(/Piletina: 2 kg umjesto 3 kg/)).toBeInTheDocument();
    expect(screen.getByText(t("orders.send.sentText", { total: "10.00 KM", store: "Market Centar" }))).toBeInTheDocument();
  });

  it("says nothing about credits: restaurants order for free", () => {
    renderModal();
    expect(screen.queryByText(/kredit|credit/i)).not.toBeInTheDocument();
  });

  it("says when the product sold out and sends nothing more", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(notSent("NOT_SENT_SOLD_OUT", 0));
    const { onReserved } = renderModal();
    await fillForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(t("orders.send.soldOut"));
    expect(submitButton()).toBeDisabled();
    expect(onReserved).not.toHaveBeenCalled();
  });

  it("puts what is left into the field when there is less stock and partial fulfilment is off", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValueOnce(notSent("QUANTITY_REDUCED", 2.5)).mockResolvedValueOnce(SENT);
    const { onReserved } = renderModal();
    await fillForm();
    await userEvent.click(partialField());
    await submit();

    expect(error).toHaveBeenCalledWith(t("orders.send.lessStock", { amount: "2.5 kg" }));
    expect(quantityField()).toHaveValue(2.5);
    expect(quantityField()).toHaveAttribute("max", "2.5");

    await submit();
    expect(apiMock.post).toHaveBeenLastCalledWith("/orders", body({ accept_partial: false }, { quantity: 2.5 }));
    expect(onReserved).toHaveBeenCalled();
  });

  it("asks to confirm a higher price and sends it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValueOnce(notSent("NOT_SENT_PRICE_RAISED", 6.5, 6)).mockResolvedValueOnce(SENT);
    renderModal();
    await fillForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      t("orders.send.priceRaised", { price: "6.00 KM", old: "5.00 KM" }),
    );
    await userEvent.click(screen.getByRole("button", { name: t("orders.send.confirmNewPrice") }));
    expect(apiMock.post).toHaveBeenLastCalledWith("/orders", body({}, { unit_price: "6" }));
  });

  it("shows the server error and stays open when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(409, "Imate previše narudžbi na čekanju."));
    const { onClose, onReserved } = renderModal();
    await fillForm();
    await submit();

    expect(error).toHaveBeenCalledWith("Imate previše narudžbi na čekanju.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onReserved).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: t("orders.send.submit") })).toBeEnabled();
  });

  it("falls back to a generic message for network errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(new Error("Network Error"));
    renderModal();

    await fillForm();
    await submit();
    expect(error).toHaveBeenCalledWith(t("reservations.actionError"));
  });

  it("asks for the pickup date, time and quantity before sending", async () => {
    renderModal();
    const fields = [dateField(), timeField(), quantityField()];
    for (const field of fields) {
      expect(field).toHaveAttribute("aria-required", "true");
      expect(field).not.toHaveAttribute("aria-invalid");
    }

    await submit();
    expect(apiMock.post).not.toHaveBeenCalled();
    for (const field of fields) {
      expect(field).toHaveAccessibleDescription(t("common.fieldRequired"));
    }
    // The date is the first field of the form.
    expect(dateField()).toHaveFocus();

    await userEvent.type(dateField(), "01/01/2030");
    await userEvent.type(timeField(), "10:00");
    expect(dateField()).not.toHaveAttribute("aria-invalid");
    expect(timeField()).not.toHaveAttribute("aria-invalid");
    expect(quantityField()).toHaveAttribute("aria-invalid", "true");
  });

  it("puts the date and time above the quantity", () => {
    renderModal();
    expect(dateField().compareDocumentPosition(quantityField()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeField().compareDocumentPosition(quantityField()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeField()).toHaveAttribute("placeholder", t("myReservations.timePlaceholder"));
    expect(timeField()).toHaveAttribute("inputmode", "numeric");
  });

  it.each([
    ["14:30", "14:30"],
    ["14.30", "14:30"],
    ["1430", "14:30"],
    ["905", "09:05"],
    ["9:05", "09:05"],
    ["9", "09:00"],
    ["14", "14:00"],
    ["0000", "00:00"],
    ["2359", "23:59"],
  ])("shows the typed time %s as %s and sends it", async (typed, shown) => {
    apiMock.post.mockResolvedValue(SENT);
    renderModal();
    await fillForm({ time: typed });
    expect(timeField()).toHaveValue(shown);

    await submit();
    expect(apiMock.post).toHaveBeenCalledWith("/orders", body({ pickup_at: `2030-01-01T${shown}` }));
  });

  it("adds the colon after the hour while typing", async () => {
    renderModal();
    await userEvent.type(timeField(), "14");
    expect(timeField()).toHaveValue("14:");
    await userEvent.type(timeField(), "3");
    expect(timeField()).toHaveValue("14:3");
    expect(timeField()).toHaveAttribute("maxlength", "5");
  });

  it("lets the colon be deleted", async () => {
    renderModal();
    await userEvent.type(timeField(), "14{Backspace}");
    expect(timeField()).toHaveValue("14");
    await userEvent.type(timeField(), "{Backspace}");
    expect(timeField()).toHaveValue("1");
  });

  it("completes the time on Enter without sending the form", async () => {
    renderModal();
    await userEvent.type(timeField(), "14{Enter}");
    expect(timeField()).toHaveValue("14:00");
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it.each([
    ["2999", "23:59"],
    ["2500", "23:00"],
    ["1260", "12:59"],
    ["147", "14:59"],
  ])("does not let %s go past 23:59 (shows %s)", async (typed, shown) => {
    apiMock.post.mockResolvedValue(SENT);
    renderModal();
    await fillForm({ time: typed });
    expect(timeField()).toHaveValue(shown);
    expect(timeField()).not.toHaveAttribute("aria-invalid");

    await submit();
    expect(apiMock.post).toHaveBeenCalledWith("/orders", expect.objectContaining({ pickup_at: `2030-01-01T${shown}` }));
  });

  it("explains an unfinished time and does not send it", async () => {
    renderModal();
    await fillForm({ time: "143" });
    expect(timeField()).toHaveValue("14:3");
    expect(timeField()).toHaveAttribute("aria-invalid", "true");
    expect(timeField()).toHaveAccessibleDescription(t("myReservations.invalidTime"));

    await submit();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("limits the calendar from today to the expiry date", () => {
    renderModal();
    const picker = screen.getByTestId("date-picker");
    expect(picker).toHaveAttribute("min", toDateInput(new Date()));
    expect(picker).toHaveAttribute("max", "2030-01-01");
  });

  it.each(["02/01/2030", "01/01/2020"])("refuses the typed date %s outside today to the expiry date", async (typed) => {
    renderModal();
    await fillForm({ date: typed });
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    expect(dateField()).toHaveAccessibleDescription(t("myReservations.pickupDateOutOfRange"));

    await submit();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("closes with the cancel button", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: t("myReservations.cancelButton") }));
    expect(onClose).toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
