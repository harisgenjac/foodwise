import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AddProductPage from "./AddProductPage.js";
import { dateInDays } from "../utils/expiry.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { ProductTemplate } from "../types/index.js";

const TEMPLATE: ProductTemplate = {
  id: 3,
  store_id: 2,
  name: "Mlijeko 3.2%",
  description: "Kutija 1L",
  category: "Dairy",
  unit: "kom",
  original_price: "2.50",
  discounted_price: "1.20",
  quantity: "40",
  shelf_life_days: 2,
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
};

const renderPage = (templates: ProductTemplate[] = []) =>
  renderWithProviders(<AddProductPage />, {
    route: "/add-product",
    path: "/add-product",
    user: makeUser({ role: "STORE" }),
    get: { "/product-templates": { templates } },
  });

const categories = () => t("categories", { returnObjects: true }) as Record<string, string>;

const fillForm = async () => {
  await userEvent.type(screen.getByLabelText(t("product.name")), "Jogurt");
  await userEvent.type(screen.getByLabelText(t("product.description")), "Tečni jogurt");
  await userEvent.click(screen.getByRole("button", { name: categories().Dairy }));
  await userEvent.type(screen.getByLabelText(t("product.originalPrice"), { exact: false }), "3");
  await userEvent.type(screen.getByLabelText(t("product.discountedPrice"), { exact: false }), "1.5");
  await userEvent.type(screen.getByLabelText(t("product.quantity")), "20");
  await userEvent.selectOptions(screen.getByLabelText(t("product.unit")), "kom");
  await userEvent.click(screen.getByRole("button", { name: t("product.expiresTomorrow") }));
};

describe("AddProductPage", () => {
  it("does not submit an incomplete form", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t("product.addButton") }));

    expect(screen.getByText(t("product.fillAllFields"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("creates the product and goes to the dashboard", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: t("product.addButton") }));

    expect(apiMock.post).toHaveBeenCalledWith("/products", {
      name: "Jogurt",
      description: "Tečni jogurt",
      category: "Dairy",
      original_price: "3",
      discounted_price: "1.5",
      quantity: "20",
      unit: "kom",
      expiry_date: dateInDays(1),
    });
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith(t("product.addedSuccess"));
    expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("also saves a template when the toggle is on", async () => {
    apiMock.post.mockResolvedValue({ data: { template: { ...TEMPLATE, id: 99, name: "Jogurt" } } });
    renderPage();

    await fillForm();
    await userEvent.click(screen.getByText(t("templates.saveToggle")));
    await userEvent.click(screen.getByRole("button", { name: t("product.addButton") }));

    expect(apiMock.post).toHaveBeenCalledWith(
      "/product-templates",
      expect.objectContaining({ name: "Jogurt", category: "Dairy", unit: "kom", shelf_life_days: 1 }),
    );
  });

  it("shows the server error when creating fails", async () => {
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(400, "Snižena cijena ne može biti veća od originalne."));
    renderPage();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: t("product.addButton") }));

    expect(error).toHaveBeenCalledWith("Snižena cijena ne može biti veća od originalne.");
    expect(screen.getByText(t("product.addError"))).toBeInTheDocument();
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });

  it("fills the form from a template and clears it when the template is clicked again", async () => {
    renderPage([TEMPLATE]);
    const templateButton = await screen.findByRole("button", { name: new RegExp(TEMPLATE.name) });

    await userEvent.click(templateButton);
    expect(screen.getByLabelText(t("product.name"))).toHaveValue(TEMPLATE.name);
    expect(screen.getByLabelText(t("product.quantity"))).toHaveValue(40);
    expect(screen.getByLabelText(t("product.expiryDate"))).toHaveValue(dateInDays(2));
    expect(screen.getByText(t("templates.updateToggle"))).toBeInTheDocument();

    await userEvent.click(templateButton);
    expect(screen.getByLabelText(t("product.name"))).toHaveValue("");
  });

  it("deletes a template after confirming", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    renderPage([TEMPLATE]);
    const item = (await screen.findByRole("button", { name: new RegExp(TEMPLATE.name) })).closest("li")!;

    await userEvent.click(within(item).getByRole("button", { name: t("templates.delete") }));
    expect(apiMock.delete).not.toHaveBeenCalled();
    await userEvent.click(within(item).getByRole("button", { name: t("templates.deleteConfirm") }));

    expect(apiMock.delete).toHaveBeenCalledWith("/product-templates/3");
    expect(screen.queryByRole("button", { name: new RegExp(TEMPLATE.name) })).not.toBeInTheDocument();
  });
});
