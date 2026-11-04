import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DataTable, { type DataColumn } from "../common/DataTable.js";

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

// The list of a reports page: each report with its columns, its format and a download button. Below
// md each report is a card: the title and description, the format pill and a full-width Download.
function ReportsTable({ items, downloading, onDownload }: ReportsTableProps) {
  const { t } = useTranslation();

  const downloadButton = (id: string, card: boolean) => (
    <button
      type="button"
      onClick={() => onDownload(id)}
      disabled={downloading !== null}
      className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-orange-200 bg-white px-3.5 text-sm font-semibold text-orange-600 transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${
        card ? "min-h-11 justify-center" : "py-2"
      }`}
    >
      <Download className="h-4 w-4" strokeWidth={2} />
      {downloading === id ? t("reports.downloading") : t("reports.download")}
    </button>
  );

  const columns: DataColumn<ReportItem>[] = [
    {
      id: "report",
      header: t("reports.table.report"),
      headerClassName: "font-semibold",
      card: "title",
      cell: ({ icon: Icon, title, description }) => (
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-sm text-gray-500">{description}</p>
          </div>
        </div>
      ),
    },
    {
      id: "columns",
      header: t("reports.table.columns"),
      className: "hidden md:table-cell",
      headerClassName: "font-semibold",
      cellClassName: "max-w-xs text-xs leading-relaxed text-gray-500",
      card: "none",
      cell: (item) => item.columns,
    },
    {
      id: "format",
      header: t("reports.table.format"),
      headerClassName: "font-semibold",
      card: "status",
      cell: () => (
        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">CSV</span>
      ),
    },
    {
      id: "download",
      header: t("reports.table.action"),
      srOnlyHeader: true,
      cellClassName: "text-right",
      card: "actions",
      cell: (item) => downloadButton(item.id, false),
      cardCell: (item) => downloadButton(item.id, true),
    },
  ];

  return (
    <DataTable
      label={t("reports.table.report")}
      rows={items}
      rowKey={(item) => item.id}
      rowClassName="align-top transition-colors hover:bg-orange-50/30"
      theadClassName="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"
      headCellClassName="px-5 py-3"
      bodyCellClassName="px-5 py-4"
      columns={columns}
    />
  );
}

export default ReportsTable;
