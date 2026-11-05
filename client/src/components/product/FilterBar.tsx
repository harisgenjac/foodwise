import { Children, useId, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FilterBarProps {
  hasActiveFilters: boolean;
  onClear: () => void;
  // Number of filters per row on large screens.
  columns?: 3 | 4 | 5;
  // The search field. Below sm it stays visible next to the "Filters" button; from sm up it is the
  // first field of the grid, as before.
  search?: ReactNode;
  // How many of the filters behind the button (not the search) are set; shown on the button.
  activeCount?: number;
  // The number of results, when the page knows it; shown on the panel's close button.
  resultCount?: number;
  // The other filters.
  children: ReactNode;
}

// Below sm the filters (all but the search) sit in a panel under the bar that the "Filters" button
// opens. The panel holds the same elements as the sm+ grid, so only the layout changes. A lone
// filter without a search stays visible: a button in front of one select would only add a tap.
function FilterBar({
  hasActiveFilters,
  onClear,
  columns = 4,
  search,
  activeCount = 0,
  resultCount,
  children,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const columnsStyle = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[columns];
  const filterCount = Children.toArray(children).length;
  const collapsible = filterCount >= (search ? 1 : 2);
  // Below sm the panel shows when it is open (or always when nothing collapses); from sm up its
  // wrapper disappears and the filters are grid items again.
  const panelVisible = !collapsible || open;

  const toggle = collapsible && (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-controls={panelId}
      className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors sm:hidden ${search ? "" : "w-full "}${
        open || activeCount > 0
          ? "border-orange-300 bg-orange-50 text-orange-700"
          : "border-gray-200 bg-white text-gray-700"
      }`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      {t("filters.button")}
      {activeCount > 0 && (
        <span className="rounded-full bg-orange-500 px-1.5 text-xs font-semibold text-white">{activeCount}</span>
      )}
    </button>
  );

  return (
    <div data-testid="filter-bar" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columnsStyle}`}>
        {search ? (
          <div className="flex gap-2 sm:contents">
            <div className="min-w-0 flex-1 sm:contents">{search}</div>
            {toggle}
          </div>
        ) : (
          toggle
        )}
        <div id={panelId} className={panelVisible ? "grid gap-3 sm:contents" : "hidden sm:contents"}>
          {children}
        </div>
      </div>
      {(hasActiveFilters || (collapsible && open)) && (
        <div
          className={`mt-3 items-center justify-between gap-2 sm:justify-end ${
            collapsible && open ? "flex" : "hidden sm:flex"
          }`}
        >
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50 sm:min-h-0"
            >
              <X className="h-4 w-4" />
              {t("filters.clear")}
            </button>
          ) : (
            <span />
          )}
          {collapsible && open && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 cursor-pointer items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 sm:hidden"
            >
              {resultCount === undefined ? t("filters.done") : t("filters.showResults", { count: resultCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface FilterFieldProps {
  icon: LucideIcon;
  children: ReactNode;
}

// Wraps one filter input/select (styled with inputStyle) and adds its leading icon.
export function FilterField({ icon: Icon, children }: FilterFieldProps) {
  return (
    <span className="relative block">
      <Icon className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400 sm:top-3" strokeWidth={1.8} />
      {children}
    </span>
  );
}

export default FilterBar;
