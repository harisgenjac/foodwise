import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FilterBarProps {
  hasActiveFilters: boolean;
  onClear: () => void;
  // Number of filters per row on large screens.
  columns?: 3 | 4 | 5;
  children: ReactNode;
}

// Full class names, so Tailwind can find them.
const COLUMN_STYLES = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

function FilterBar({ hasActiveFilters, onClear, columns = 4, children }: FilterBarProps) {
  const { t } = useTranslation();
  const columnsStyle = COLUMN_STYLES[columns];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columnsStyle}`}>{children}</div>
      {hasActiveFilters && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50"
          >
            <X className="h-4 w-4" />
            {t("filters.clear")}
          </button>
        </div>
      )}
    </div>
  );
}

interface FilterFieldProps {
  icon: LucideIcon;
  // Extra classes for the wrapper, e.g. a column span.
  className?: string;
  children: ReactNode;
}

// Wraps one filter input/select (styled with inputStyle) and adds its leading icon.
export function FilterField({ icon: Icon, className = "", children }: FilterFieldProps) {
  return (
    <span className={`relative block ${className}`}>
      <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" strokeWidth={1.8} />
      {children}
    </span>
  );
}

export default FilterBar;
