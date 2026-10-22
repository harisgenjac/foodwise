import { useState } from "react";
import api from "../api/axios.js";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, Download, FileSpreadsheet, FileUp, ListChecks } from "lucide-react";
import FormSection from "../components/form/FormSection.js";
import { CATEGORY_LABELS } from "../utils/categories.js";
import { UNIT_LABELS } from "../utils/units.js";
import { dateInDays } from "../utils/expiry.js";
import type { CsvRowError } from "../types/index.js";
import InsufficientCreditsNotice from "../components/credits/InsufficientCreditsNotice.js";
import { getCreditError, type CreditError } from "../utils/credits.js";

// Keep in sync with CSV_COLUMNS in server/src/utils/productCsv.ts.
const CSV_COLUMNS = [
  "name",
  "description",
  "category",
  "original_price",
  "discounted_price",
  "quantity",
  "unit",
  "expiry_date",
];

// The BOM makes Excel open the file as UTF-8, so letters like "č" and "ž" survive.
// The date is DD.MM.YYYY, which Excel with Bosnian settings reads and saves back unchanged.
const downloadTemplate = () => {
  const expiry = dateInDays(3).split("-").reverse().join(".");
  const example = ["Piletina", "Svježi pileći file", "Meat", "10.00", "6.50", "5", "kg", expiry];
  const content = `﻿${CSV_COLUMNS.join(",")}\n${example.join(",")}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "proizvodi-sablon.csv";
  link.click();
  URL.revokeObjectURL(url);
};

function ImportProductsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectFile = (selected: File | null) => {
    setFile(selected);
    setError("");
    setCreditError(null);
    setRowErrors([]);
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setError(t("importProducts.noFile"));
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setError("");
    setRowErrors([]);
    setCreditError(null);
    try {
      const response = await api.post("/products/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(t("importProducts.success", { count: response.data.products.length }));
      navigate("/my-products");
    } catch (err) {
      // Each product costs a credit and the import is all or nothing.
      const credits = getCreditError(err);
      if (credits) {
        setCreditError(credits);
        return;
      }
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      setError(data?.error || t("importProducts.error"));
      setRowErrors(data?.rowErrors ?? []);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <FileUp className="h-5 w-5" strokeWidth={1.8} />
            </span>
            {t("importProducts.title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{t("importProducts.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer"
        >
          <Download className="h-4 w-4" />
          {t("importProducts.downloadTemplate")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FormSection
            title={t("importProducts.uploadTitle")}
            icon={FileSpreadsheet}
            description={t("importProducts.uploadDescription")}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-6 py-10 text-center transition-colors hover:border-orange-300 hover:bg-orange-50/40">
                <FileUp className="h-8 w-8 text-orange-500" strokeWidth={1.6} />
                <span className="text-sm font-medium text-gray-900">
                  {file ? file.name : t("importProducts.chooseFile")}
                </span>
                <span className="text-xs text-gray-500">{t("importProducts.fileHint")}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label={t("importProducts.chooseFile")}
                  onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>

              {creditError && <InsufficientCreditsNotice error={creditError} />}
              {error && (
                <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              {rowErrors.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-red-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-red-50 text-xs uppercase tracking-wide text-red-700">
                      <tr>
                        <th className="w-24 px-4 py-2 font-semibold">{t("importProducts.row")}</th>
                        <th className="px-4 py-2 font-semibold">{t("importProducts.problem")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {rowErrors.map((rowError) => (
                        <tr key={rowError.row}>
                          <td className="px-4 py-2 font-medium text-gray-900">{rowError.row}</td>
                          <td className="px-4 py-2 text-gray-700">{rowError.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
                >
                  <FileUp className="h-5 w-5" strokeWidth={1.8} />
                  {uploading ? t("importProducts.importing") : t("importProducts.importButton")}
                </button>
                <Link
                  to="/my-products"
                  className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {t("product.cancel")}
                </Link>
              </div>
            </form>
          </FormSection>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <FormSection title={t("importProducts.formatTitle")} icon={ListChecks}>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-gray-600">
              <li>{t("importProducts.formatColumns")}</li>
              <li>{t("importProducts.formatSeparator")}</li>
              <li>{t("importProducts.formatDate")}</li>
              <li>{t("importProducts.formatAllOrNothing")}</li>
            </ul>
            <code className="mt-4 block break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {CSV_COLUMNS.join(",")}
            </code>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("importProducts.categoryCodes")}
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {Object.keys(CATEGORY_LABELS).map((code) => (
                <div key={code} className="contents">
                  <dt className="font-mono text-gray-900">{code}</dt>
                  <dd className="text-gray-500">{t(`categories.${code}`)}</dd>
                </div>
              ))}
            </dl>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("importProducts.unitCodes")}
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {Object.keys(UNIT_LABELS).map((code) => (
                <div key={code} className="contents">
                  <dt className="font-mono text-gray-900">{code}</dt>
                  <dd className="text-gray-500">{t(`units.${code}`)}</dd>
                </div>
              ))}
            </dl>
          </FormSection>
        </aside>
      </div>
    </div>
  );
}

export default ImportProductsPage;
