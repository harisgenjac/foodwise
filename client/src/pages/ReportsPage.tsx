import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CalendarRange, Download, FileChartColumn, Leaf, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api from "../api/axios.js";
import { translateServerMessage } from "../i18n/serverMessages.js";
import { useAuth } from "../context/AuthContext.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FormSection from "../components/form/FormSection.js";
import DateInput from "../components/form/DateInput.js";
import { PRESETS, presetPeriod, type Preset } from "../utils/reportPeriods.js";

type ReportId = "sales" | "impact";

// A new report needs a server route under /api/reports, an entry here and its i18n keys.
const REPORTS: { id: ReportId; icon: LucideIcon }[] = [
  { id: "sales", icon: Receipt },
  { id: "impact", icon: Leaf },
];

// The report is requested as a blob, so a JSON error body arrives as a blob too.
const readError = async (err: unknown): Promise<string | null> => {
  if (!axios.isAxiosError(err) || !(err.response?.data instanceof Blob)) return null;
  try {
    const message = JSON.parse(await err.response.data.text()).error;
    return typeof message === "string" ? translateServerMessage(message) : null;
  } catch {
    return null;
  }
};

const saveFile = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const role = user?.role === "STORE" ? "store" : "restaurant";

  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [period, setPeriod] = useState(() => presetPeriod("thisMonth"));
  const [downloading, setDownloading] = useState<ReportId | null>(null);

  const choosePreset = (next: Exclude<Preset, "custom">) => {
    setPreset(next);
    setPeriod(presetPeriod(next));
  };

  const changeDate = (field: "from" | "to", value: string) => {
    setPreset("custom");
    setPeriod((current) => ({ ...current, [field]: value }));
  };

  const download = async (id: ReportId) => {
    if (!period.from || !period.to || period.from > period.to) {
      toast.error(t("reports.invalidPeriod"));
      return;
    }
    setDownloading(id);
    try {
      const response = await api.get(`/reports/${id}`, {
        params: { from: period.from, to: period.to, lang: i18n.language },
        responseType: "blob",
      });
      saveFile(response.data, `${t(`reports.fileNames.${id}.${role}`)}-${period.from}-${period.to}.csv`);
    } catch (err) {
      toast.error((await readError(err)) || t("reports.downloadError"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <ProductPageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} icon={FileChartColumn} />

      <FormSection title={t("reports.periodTitle")} icon={CalendarRange} description={t("reports.periodDescription")}>
        <div className="mb-5 flex flex-wrap gap-2">
          {[...PRESETS, "custom" as const].map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={preset === key}
              onClick={() => (key === "custom" ? setPreset("custom") : choosePreset(key))}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                preset === key
                  ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t(`reports.presets.${key}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateInput
            label={t("reports.from")}
            value={period.from}
            max={period.to || undefined}
            onChange={(value) => changeDate("from", value)}
          />
          <DateInput
            label={t("reports.to")}
            value={period.to}
            min={period.from || undefined}
            onChange={(value) => changeDate("to", value)}
          />
        </div>
      </FormSection>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">{t("reports.table.report")}</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">{t("reports.table.columns")}</th>
              <th className="px-5 py-3 font-semibold">{t("reports.table.format")}</th>
              <th className="px-5 py-3">
                <span className="sr-only">{t("reports.table.action")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {REPORTS.map(({ id, icon: Icon }) => (
              <tr key={id} className="align-top transition-colors hover:bg-orange-50/30">
                <td className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{t(`reports.items.${id}.${role}.title`)}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{t(`reports.items.${id}.${role}.description`)}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden max-w-xs px-5 py-4 text-xs leading-relaxed text-gray-500 md:table-cell">
                  {t(`reports.items.${id}.${role}.columns`)}
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    CSV
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => download(id)}
                    disabled={downloading !== null}
                    className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-sm font-semibold text-orange-600 transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" strokeWidth={2} />
                    {downloading === id ? t("reports.downloading") : t("reports.download")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-gray-400">{t("reports.note")}</p>
    </div>
  );
}

export default ReportsPage;
