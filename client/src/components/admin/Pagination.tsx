import { Fragment } from "react";
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

  // 44 px tap targets below sm, the old size from sm up.
  const buttonStyle =
    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:min-w-0";
  const pageStyle = "min-h-11 min-w-11 rounded-xl px-3 py-2 text-sm sm:min-h-0 sm:min-w-9";

  // Below sm only the first, current and last page fit next to 44 px arrows, with an ellipsis for
  // each gap; the other numbers and the wide ellipses show from sm up.
  const items = pageItems(current, totalPages);
  const onPhone = (page: number) => page === 1 || page === current || page === totalPages;
  let lastOnPhone = 0;

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
        {items.map((item, index) => {
          if (item === "ellipsis") {
            return (
              <span key={`ellipsis-${index}`} className="hidden px-1 text-sm text-gray-400 sm:inline" aria-hidden="true">
                …
              </span>
            );
          }
          const shown = onPhone(item);
          const phoneGap = shown && lastOnPhone > 0 && item - lastOnPhone > 1;
          if (shown) lastOnPhone = item;
          return (
            <Fragment key={item}>
              {phoneGap && (
                <span className="px-1 text-sm text-gray-400 sm:hidden" aria-hidden="true">
                  …
                </span>
              )}
              <button
                type="button"
                onClick={() => goTo(item)}
                aria-label={t("admin.common.page", { page: item })}
                aria-current={item === current ? "page" : undefined}
                className={`${shown ? "" : "hidden sm:inline-block "}${pageStyle} ${
                  item === current
                    ? "cursor-default bg-orange-500 font-semibold text-white shadow-sm"
                    : "cursor-pointer border border-gray-200 bg-white font-medium text-gray-700 transition-colors hover:bg-gray-50"
                }`}
              >
                {item}
              </button>
            </Fragment>
          );
        })}
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
