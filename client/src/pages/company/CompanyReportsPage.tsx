import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { FileChartColumn, Leaf, Receipt, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api from "../../api/axios.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import ReportPeriodPicker, { useReportPeriod } from "../../components/reports/ReportPeriodPicker.js";
import ReportsTable from "../../components/reports/ReportsTable.js";
import { readError, saveFile } from "../../utils/reportDownload.js";
import type { CompanyCredits } from "../../types/index.js";

// A new report needs a server route under /api/company/reports, an entry here and its i18n keys.
const REPORTS: { id: "sales" | "impact" | "branches"; icon: LucideIcon }[] = [
  { id: "sales", icon: Receipt },
  { id: "impact", icon: Leaf },
  { id: "branches", icon: Store },
];

// The headquarters' reports ("Izvještaji"): the store reports pattern over all branches or one.
function CompanyReportsPage() {
  const { t, i18n } = useTranslation();
  const periodState = useReportPeriod();
  const { period } = periodState;
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<CompanyCredits["branches"]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Every branch, deactivated ones too (the credits list is not paged).
  useEffect(() => {
    api
      .get("/company/credits")
      .then((response) => setBranches(response.data.branches))
      .catch((err) => console.error("Error loading branches:", err));
  }, []);

  const download = async (id: string) => {
    if (!periodState.valid) {
      toast.error(t("reports.invalidPeriod"));
      return;
    }
    setDownloading(id);
    try {
      const response = await api.get(`/company/reports/${id}`, {
        params: { from: period.from, to: period.to, lang: i18n.language, ...(branchId && { branch_id: branchId }) },
        responseType: "blob",
      });
      saveFile(response.data, `${t(`company.reports.fileNames.${id}`)}-${period.from}-${period.to}.csv`);
    } catch (err) {
      toast.error((await readError(err)) || t("reports.downloadError"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <ProductPageHeader
        title={t("company.reports.title")}
        subtitle={t("company.reports.subtitle")}
        icon={FileChartColumn}
      />
      <ReportPeriodPicker state={periodState}>
        <div className="mt-4 sm:w-1/2 sm:pr-2">
          <FormField label={t("company.reports.branch")} icon={Store}>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputStyle}>
              <option value="">{t("company.reports.allBranches")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.status === "active"
                    ? branch.business_name
                    : `${branch.business_name} (${t(`company.branchStatus.${branch.status}`)})`}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </ReportPeriodPicker>
      <ReportsTable
        items={REPORTS.map(({ id, icon }) => ({
          id,
          icon,
          title: t(`company.reports.items.${id}.title`),
          description: t(`company.reports.items.${id}.description`),
          columns: t(`company.reports.items.${id}.columns`),
        }))}
        downloading={downloading}
        onDownload={download}
      />
      <p className="text-center text-xs text-gray-400">{t("reports.note")}</p>
    </div>
  );
}

export default CompanyReportsPage;
