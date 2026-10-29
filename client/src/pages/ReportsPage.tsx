import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { FileChartColumn, Leaf, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import ReportPeriodPicker, { useReportPeriod } from "../components/reports/ReportPeriodPicker.js";
import ReportsTable from "../components/reports/ReportsTable.js";
import { readError, saveFile } from "../utils/reportDownload.js";

// A new report needs a server route under /api/reports, an entry here and its i18n keys.
const REPORTS: { id: "sales" | "impact"; icon: LucideIcon }[] = [
  { id: "sales", icon: Receipt },
  { id: "impact", icon: Leaf },
];

function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const role = user?.role === "STORE" ? "store" : "restaurant";
  const periodState = useReportPeriod();
  const { period } = periodState;
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (id: string) => {
    if (!periodState.valid) {
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
      <ReportPeriodPicker state={periodState} />
      <ReportsTable
        items={REPORTS.map(({ id, icon }) => ({
          id,
          icon,
          title: t(`reports.items.${id}.${role}.title`),
          description: t(`reports.items.${id}.${role}.description`),
          columns: t(`reports.items.${id}.${role}.columns`),
        }))}
        downloading={downloading}
        onDownload={download}
      />
      <p className="text-center text-xs text-gray-400">{t("reports.note")}</p>
    </div>
  );
}

export default ReportsPage;
