import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import ReserveProductModal from "./ReserveProductModal.js";
import { MemoryRouter } from "react-router-dom";
import { apiMock, axiosError, creditError, makeProduct, t } from "../../test/utils.js";

const product = makeProduct({ id: 7, available_quantity: "6.50", quantity: "10" });

const renderModal = () => {
  const onClose = vi.fn();
  const onReserved = vi.fn();
  render(<ReserveProductModal product={product} onClose={onClose} onReserved={onReserved} />);
  return { onClose, onReserved };
};

const fillForm = async () => {
  await userEvent.type(screen.getByLabelText(t("dashboard.quantity"), { exact: false }), "3");
  const pickup = screen.getByLabelText(t("myReservations.pickupDate"));
  await userEvent.type(pickup, "2030-01-01T10:00");
};

describe("ReserveProductModal", () => {
  it("shows the product, the store and the quantity still available", () => {
    renderModal();
    expect(screen.getByText("Piletina")).toBeInTheDocument();
    expect(screen.getByText("Market Centar · Sarajevo")).toBeInTheDocument();
    expect(screen.getByText(/6\.5/)).toBeInTheDocument();
    expect(screen.getByLabelText(t("dashboard.quantity"), { exact: false })).toHaveAttribute("max", "6.50");
  });

  it("reserves, closes and notifies the parent", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    const { onClose, onReserved } = renderModal();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: t("myReservations.confirmButton") }));

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
    await userEvent.click(screen.getByRole("button", { name: t("myReservations.confirmButton") }));

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
    await userEvent.click(screen.getByRole("button", { name: t("myReservations.confirmButton") }));

    expect(error).toHaveBeenCalledWith("Not enough product available.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onReserved).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for network errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(new Error("Network Error"));
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: t("myReservations.confirmButton") }));
    expect(error).toHaveBeenCalledWith(t("reservations.actionError"));
  });

  it("closes with the cancel button", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: t("myReservations.cancelButton") }));
    expect(onClose).toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
