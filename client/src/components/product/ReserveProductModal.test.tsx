import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import ReserveProductModal from "./ReserveProductModal.js";
import { MemoryRouter } from "react-router-dom";
import { apiMock, axiosError, creditError, makeProduct, t } from "../../test/utils.js";
import { toDateInput } from "../../utils/expiry.js";

const product = makeProduct({ id: 7, available_quantity: "6.50", quantity: "10" });

const renderModal = () => {
  const onClose = vi.fn();
  const onReserved = vi.fn();
  render(<ReserveProductModal product={product} onClose={onClose} onReserved={onReserved} />);
  return { onClose, onReserved };
};

const dateField = () => screen.getByLabelText(t("myReservations.pickupDate"));
const timeField = () => screen.getByLabelText(t("myReservations.pickupTime"));
const quantityField = () => screen.getByLabelText(t("dashboard.quantity"), { exact: false });
const submit = () => userEvent.click(screen.getByRole("button", { name: t("myReservations.confirmButton") }));

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
  });

  it("reserves, closes and notifies the parent", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    const { onClose, onReserved } = renderModal();

    await fillForm();
    await submit();

    expect(apiMock.post).toHaveBeenCalledWith("/reservations", {
      product_id: 7,
      quantity: "3",
      pickup_date: "2030-01-01T10:00",
    });
    expect(success).toHaveBeenCalledWith(t("myProducts.reservationCreated"));
    expect(onClose).toHaveBeenCalled();
    expect(onReserved).toHaveBeenCalled();
  });

  it("explains a missing subscription inside the dialog with a link to it", async () => {
    apiMock.post.mockRejectedValue(creditError(false));
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ReserveProductModal product={product} onClose={onClose} onReserved={vi.fn()} />
      </MemoryRouter>,
    );

    await fillForm();
    await submit();

    expect(await screen.findByText(t("credits.insufficient.noSubscription"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("credits.insufficient.subscribeLink") })).toHaveAttribute(
      "href",
      "/my-profile#subscription",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the server error and stays open when the reservation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(400, "Not enough product available."));
    const { onClose, onReserved } = renderModal();

    await fillForm();
    await submit();

    expect(error).toHaveBeenCalledWith("Not enough product available.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onReserved).not.toHaveBeenCalled();
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
    apiMock.post.mockResolvedValue({ data: {} });
    renderModal();
    await fillForm({ time: typed });
    expect(timeField()).toHaveValue(shown);

    await submit();
    expect(apiMock.post).toHaveBeenCalledWith("/reservations", {
      product_id: 7,
      quantity: "3",
      pickup_date: `2030-01-01T${shown}`,
    });
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
    ["2500", "25:00"],
    ["1260", "12:60"],
    ["147", "14:7"],
  ])("keeps the invalid time %s as %s and explains it", async (typed, shown) => {
    renderModal();
    await fillForm({ time: typed });
    expect(timeField()).toHaveValue(shown);
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
