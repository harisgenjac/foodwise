import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ReportItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  columns: string;
}

interface ReportsTableProps {
  items: ReportItem[];
  // The report being downloaded; every button waits meanwhile.
  downloading: string | null;
  onDownload: (id: string) => void;
}

// The list of a reports page: each report with its columns, its format and a download button.
function ReportsTable({ items, downloading, onDownload }: ReportsTableProps) {
  const { t } = useTranslation();

  return (
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
          {items.map(({ id, icon: Icon, title, description, columns }) => (
            <tr key={id} className="align-top transition-colors hover:bg-orange-50/30">
              <td className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{description}</p>
                  </div>
                </div>
              </td>
              <td className="hidden max-w-xs px-5 py-4 text-xs leading-relaxed text-gray-500 md:table-cell">
                {columns}
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  CSV
                </span>
              </td>
              <td className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => onDownload(id)}
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
  );
}

export default ReportsTable;
