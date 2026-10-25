import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageItems } from "../../utils/pagination.js";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}

// "11–20 of 120", previous/next and page numbers (1 … 4 5 6 … 12); hidden when everything fits
// on one page.
function Pagination({ total, limit, offset, onChange }: PaginationProps) {
  const { t } = useTranslation();
  if (total <= limit) return null;

  const current = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const goTo = (page: number) => onChange((page - 1) * limit);

  const buttonStyle =
    "inline-flex cursor-pointer items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <nav aria-label={t("admin.common.pagination")} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-500">
        {t("admin.common.range", { from: offset + 1, to: Math.min(offset + limit, total), total })}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => goTo(current - 1)} disabled={current === 1} className={buttonStyle}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">{t("admin.common.previous")}</span>
        </button>
        {pageItems(current, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm text-gray-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => goTo(item)}
              aria-label={t("admin.common.page", { page: item })}
              aria-current={item === current ? "page" : undefined}
              className={
                item === current
                  ? "min-w-9 cursor-default rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  : "min-w-9 cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              }
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => goTo(current + 1)}
          disabled={current === totalPages}
          className={buttonStyle}
        >
          <span className="sr-only sm:not-sr-only">{t("admin.common.next")}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
