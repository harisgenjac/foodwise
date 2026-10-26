import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import ImportProductsPage from "./ImportProductsPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";

const renderPage = () =>
  renderWithProviders(<ImportProductsPage />, {
    route: "/import-products",
    path: "/import-products",
    user: makeUser({ role: "STORE" }),
  });

const csvFile = () => new File(["name,category\n"], "proizvodi.csv", { type: "text/csv" });

const chooseFile = async () => {
  await userEvent.upload(await screen.findByLabelText(t("importProducts.chooseFile")), csvFile());
};

describe("ImportProductsPage", () => {
  it("asks for a file before sending anything", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("importProducts.importButton") }));

    expect(screen.getByText(t("importProducts.noFile"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("uploads the file and goes to my products", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: { products: [{ id: 1 }, { id: 2 }] } });
    renderPage();

    await chooseFile();
    expect(screen.getByText("proizvodi.csv")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("importProducts.importButton") }));

    const [url, body] = apiMock.post.mock.calls[0]!;
    expect(url).toBe("/products/import");
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(success).toHaveBeenCalledWith(t("importProducts.success", { count: 2 }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/my-products");
  });

  it("lists the rows the server rejected", async () => {
    const errorToast = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(
      new AxiosError("Request failed", "400", undefined, undefined, {
        status: 400,
        statusText: "",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          error: "The CSV contains invalid rows.",
          rowErrors: [
            { row: 3, error: "Category is not valid." },
            { row: 5, error: "Expiry date is not valid." },
          ],
        },
      }),
    );
    renderPage();

    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: t("importProducts.importButton") }));

    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    expect(errorToast).toHaveBeenCalledWith("The CSV contains invalid rows.");
    expect(screen.queryByText("The CSV contains invalid rows.")).not.toBeInTheDocument();
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("3Category is not valid.");
    expect(rows[2]).toHaveTextContent("5Expiry date is not valid.");
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});
