import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductFormFields, { EMPTY_PRODUCT_FORM } from "./ProductFormFields.js";
import { dateInDays } from "../../utils/expiry.js";
import { t } from "../../test/utils.js";
import type { ProductFormValues } from "../../types/index.js";

const renderFields = (values: Partial<ProductFormValues> = {}, minExpiryDate?: string) => {
  const onChange = vi.fn();
  render(
    <ProductFormFields values={{ ...EMPTY_PRODUCT_FORM, ...values }} onChange={onChange} minExpiryDate={minExpiryDate} />,
  );
  return onChange;
};

describe("ProductFormFields", () => {
  it("reports text, number and select changes by field", async () => {
    const onChange = renderFields();

    await userEvent.type(screen.getByLabelText(t("product.name")), "M");
    expect(onChange).toHaveBeenLastCalledWith("name", "M");

    await userEvent.type(screen.getByLabelText(t("product.originalPrice"), { exact: false }), "5");
    expect(onChange).toHaveBeenLastCalledWith("original_price", "5");

    await userEvent.selectOptions(screen.getByLabelText(t("product.unit")), "kg");
    expect(onChange).toHaveBeenLastCalledWith("unit", "kg");
  });

  it("renders a button per category and marks the selected one", async () => {
    const onChange = renderFields({ category: "Dairy" });
    const categories = t("categories", { returnObjects: true }) as Record<string, string>;

    expect(screen.getByRole("button", { name: categories.Dairy })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: categories.Meat })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: categories.Meat }));
    expect(onChange).toHaveBeenCalledWith("category", "Meat");
  });

  it("shows the discount percentage for valid prices", () => {
    renderFields({ original_price: "10", discounted_price: "7.5" });
    expect(screen.getByText(t("product.discountBadge", { percent: 25 }))).toBeInTheDocument();
  });

  it("warns when the discounted price is not lower", () => {
    renderFields({ original_price: "5", discounted_price: "6" });
    expect(screen.getByText(t("product.discountInvalid"))).toBeInTheDocument();
  });

  it("shows nothing about the discount until both prices are set", () => {
    renderFields({ original_price: "5" });
    expect(screen.queryByText(t("product.discountInvalid"))).not.toBeInTheDocument();
  });

  it("fills the expiry date from the shortcuts and applies the minimum date", async () => {
    const onChange = renderFields({}, "2026-10-20");
    expect(screen.getByLabelText(t("product.expiryDate"))).toHaveAttribute("min", "2026-10-20");

    await userEvent.click(screen.getByRole("button", { name: t("product.expiresTomorrow") }));
    expect(onChange).toHaveBeenCalledWith("expiry_date", dateInDays(1));

    await userEvent.click(screen.getByRole("button", { name: t("product.expiresInDays", { count: 7 }) }));
    expect(onChange).toHaveBeenCalledWith("expiry_date", dateInDays(7));
  });
});
