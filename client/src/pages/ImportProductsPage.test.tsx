import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosRequestConfig } from "axios";
import ImportProductsPage from "./ImportProductsPage.js";
import { CreditsProvider } from "../context/CreditsContext.js";
import { apiMock, creditError, makeCreditSummary, makeUser, renderWithProviders, t } from "../test/utils.js";

// Resolves once the balance is loaded (the hint under the button), since the confirmation names it.
const renderPage = async (available = 10) => {
  renderWithProviders(
    <CreditsProvider enabled>
      <ImportProductsPage />
    </CreditsProvider>,
    {
      route: "/import-products",
      path: "/import-products",
      user: makeUser({ role: "STORE" }),
      get: { "/credits/me": { credits: makeCreditSummary({ available }) } },
    },
  );
  await screen.findByText(t("credits.hint.perProduct", { left: available }));
};

const csvFile = () => new File(["name,category\n"], "proizvodi.csv", { type: "text/csv" });

const chooseFile = async () => {
  await userEvent.upload(await screen.findByLabelText(t("importProducts.chooseFile")), csvFile());
};

const isDryRunConfig = (config?: AxiosRequestConfig) => (config?.params as { dryRun?: boolean } | undefined)?.dryRun === true;
const isDryRun = (call: unknown[]) => isDryRunConfig(call[2] as AxiosRequestConfig | undefined);

// The dry run answers with the product count; the import with the created products.
const mockImport = (count: number) =>
  apiMock.post.mockImplementation(async (_url: string, _body?: unknown, config?: AxiosRequestConfig) =>
    isDryRunConfig(config)
      ? { data: { message: "The file is valid.", count } }
      : { data: { products: Array.from({ length: count }, (_, i) => ({ id: i + 1 })) } },
  );

const submit = async () => {
  await chooseFile();
  await userEvent.click(screen.getByRole("button", { name: t("importProducts.importButton") }));
};

describe("ImportProductsPage", () => {
  it("asks for a file before sending anything", async () => {
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("importProducts.importButton") }));

    expect(screen.getByText(t("importProducts.noFile"))).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("checks the file, confirms the credits it uses, then imports and goes to my products", async () => {
    const success = vi.spyOn(toast, "success");
    mockImport(2);
    await renderPage(7);

    await chooseFile();
    expect(screen.getByText("proizvodi.csv")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("importProducts.importButton") }));

    const dialog = await screen.findByRole("dialog", { name: t("importProducts.confirmTitle", { count: 2 }) });
    expect(dialog).toHaveTextContent(t("importProducts.confirmText", { count: 2, left: 7 }));
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0]!;
    expect(url).toBe("/products/import");
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(isDryRun(apiMock.post.mock.calls[0]!)).toBe(true);

    await userEvent.click(within(dialog).getByRole("button", { name: t("importProducts.confirmButton", { count: 2 }) }));

    expect(apiMock.post).toHaveBeenCalledTimes(2);
    expect(isDryRun(apiMock.post.mock.calls[1]!)).toBe(false);
    expect(success).toHaveBeenCalledWith(t("importProducts.success", { count: 2 }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/my-products");
  });

  it("imports nothing when the confirmation is cancelled", async () => {
    mockImport(3);
    await renderPage();

    await submit();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(isDryRun(apiMock.post.mock.calls[0]!)).toBe(true);
  });

  it("skips the confirmation without enough credits and shows the server's notice", async () => {
    apiMock.post.mockImplementation(async (_url: string, _body?: unknown, config?: AxiosRequestConfig) => {
      if (isDryRunConfig(config)) return { data: { message: "The file is valid.", count: 5 } };
      throw creditError(true);
    });
    await renderPage(2);

    await submit();

    expect(await screen.findByText(t("credits.insufficient.title"))).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(2);
  });

  it("lists the rows the server rejected before asking for anything", async () => {
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
    await renderPage();

    await submit();

    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    expect(errorToast).toHaveBeenCalledWith("The CSV contains invalid rows.");
    expect(screen.queryByText("The CSV contains invalid rows.")).not.toBeInTheDocument();
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("3Category is not valid.");
    expect(rows[2]).toHaveTextContent("5Expiry date is not valid.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});
