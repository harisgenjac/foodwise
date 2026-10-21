import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}

// "26–50 of 120" with previous/next buttons; hidden when everything fits on one page.
function Pagination({ total, limit, offset, onChange }: PaginationProps) {
  const { t } = useTranslation();
  if (total <= limit) return null;

  const buttonStyle =
    "inline-flex cursor-pointer items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-gray-500">
        {t("admin.common.range", { from: offset + 1, to: Math.min(offset + limit, total), total })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className={buttonStyle}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("admin.common.previous")}
        </button>
        <button
          type="button"
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
          className={buttonStyle}
        >
          {t("admin.common.next")}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
