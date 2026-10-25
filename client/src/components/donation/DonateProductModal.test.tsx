import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import DonateProductModal from "./DonateProductModal.js";
import { apiMock, axiosError, makeProduct, mockGet, t } from "../../test/utils.js";
import type { Product } from "../../types/index.js";

const renderModal = (product: Product) => {
  const onClose = vi.fn();
  const onDonated = vi.fn();
  render(<DonateProductModal product={product} onClose={onClose} onDonated={onDonated} />);
  return { onClose, onDonated };
};

const quantityInput = () => screen.getByLabelText(t("donations.fromProduct.quantity"), { exact: false });
const confirmButton = () => screen.getByRole("button", { name: t("donations.fromProduct.confirm") });

describe("DonateProductModal", () => {
  it("donates the whole available quantity for free by default", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    const { onClose, onDonated } = renderModal(makeProduct({ id: 4, available_quantity: "6" }));

    expect(quantityInput()).toHaveValue(6);
    await userEvent.click(confirmButton());

    expect(apiMock.post).toHaveBeenCalledWith("/donations/from-product/4", {
      donation_type: "FREE",
      quantity: "6",
      donation_price: null,
    });
    expect(success).toHaveBeenCalledWith(t("donations.fromProduct.success"));
    expect(onClose).toHaveBeenCalled();
    expect(onDonated).toHaveBeenCalled();
  });

  it("loads the free quantity when the list did not include it", async () => {
    mockGet({ "/products/4": { product: makeProduct({ id: 4, available_quantity: "3" }) } });
    const product = makeProduct({ id: 4, quantity: "10" });
    delete product.available_quantity;
    renderModal(product);

    expect(await screen.findByDisplayValue("3")).toBeInTheDocument();
  });

  it("requires a price for a paid donation and sends nothing without it", async () => {
    renderModal(makeProduct({ id: 4, available_quantity: "6", original_price: "10.00" }));

    await userEvent.click(screen.getByRole("radio", { name: t("donations.types.SPONSORED") }));
    const price = screen.getByLabelText(t("donations.form.donationPrice"), { exact: false });
    expect(price).toHaveAttribute("aria-required", "true");
    expect(price).not.toHaveAttribute("aria-invalid");

    await userEvent.clear(quantityInput());
    await userEvent.click(confirmButton());
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(quantityInput()).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(price).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(quantityInput()).toHaveFocus();
  });

  it("sends the donation price for a paid donation", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderModal(makeProduct({ id: 4, available_quantity: "6", original_price: "10.00" }));

    await userEvent.click(screen.getByRole("radio", { name: t("donations.types.SPONSORED") }));
    await userEvent.clear(quantityInput());
    await userEvent.type(quantityInput(), "2");
    await userEvent.type(screen.getByLabelText(t("donations.form.donationPrice"), { exact: false }), "4");
    expect(screen.getByText(t("donations.form.donorPays", { price: "4", percent: 60 }))).toBeInTheDocument();
    await userEvent.click(confirmButton());

    expect(apiMock.post).toHaveBeenCalledWith("/donations/from-product/4", {
      donation_type: "SPONSORED",
      quantity: "2",
      donation_price: "4",
    });
  });

  it("blocks moving when everything is reserved", () => {
    renderModal(makeProduct({ available_quantity: "0" }));
    expect(screen.getByText(t("donations.fromProduct.nothingAvailable"))).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("shows the server error", async () => {
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(400, "Not enough product available."));
    const { onClose } = renderModal(makeProduct({ available_quantity: "6" }));

    await userEvent.click(confirmButton());

    expect(error).toHaveBeenCalledWith("Not enough product available.");
    expect(onClose).not.toHaveBeenCalled();
  });
});
