import { useTranslation } from "react-i18next";
import { Filter, Search, Trash2, X } from "lucide-react";

// One active filter as a chip under the bar ("Do 10 km ×").
export interface ActiveFilter {
  key: string;
  label: string;
  // Names the × button, e.g. "Ukloni filter: udaljenost".
  removeLabel: string;
  onRemove: () => void;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  // The filters behind the "Filteri" button (shown as chips and counted on the button).
  activeFilters: ActiveFilter[];
  // Opens the FilterDrawer; `filtersOpen` and `drawerId` wire aria-expanded / aria-controls.
  onOpenFilters: () => void;
  filtersOpen: boolean;
  drawerId: string;
  // Removes the search and every filter; disabled while nothing is set.
  onClear: () => void;
  canClear: boolean;
}

// The app-wide list filter (design/stores/stores-list.html): a white card with the search field,
// "Filteri" with the number of active filters (it opens the FilterDrawer) and "Očisti", and under
// it "Aktivni filteri:" with a chip per active filter whose × removes it. Every filter applies as
// it changes; the page owns the state.
function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  activeFilters,
  onOpenFilters,
  filtersOpen,
  drawerId,
  onClear,
  canClear,
}: FilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-[20px] border border-[#EEEDEB] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
        <label className="relative block min-w-0 flex-[1_1_100%] sm:flex-[0_1_440px]">
          <span className="sr-only">{searchPlaceholder}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-12 w-full rounded-xl border border-neutral-200 bg-white pr-3.5 pl-11 text-base text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]"
          />
        </label>
        <div className="flex flex-1 justify-end gap-2.5 sm:ml-auto sm:flex-none">
          <button
            type="button"
            onClick={onOpenFilters}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            aria-controls={drawerId}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-brand-800 bg-white px-5 text-sm font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:flex-none"
          >
            <Filter className="h-[18px] w-[18px]" aria-hidden="true" />
            {t("listFilters.button")}
            {activeFilters.length > 0 && (
              <span
                data-testid="filter-count"
                className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-800 px-1.5 text-xs font-extrabold text-white"
              >
                <span className="sr-only">{t("listFilters.activeCount", { count: activeFilters.length })}</span>
                <span aria-hidden="true">{activeFilters.length}</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-5 text-sm font-bold text-neutral-600 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
            {t("listFilters.clear")}
          </button>
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#EEEDEB] px-4 pt-3 pb-3.5 sm:px-5">
          <span className="text-[13px] font-bold text-neutral-600">{t("listFilters.active")}</span>
          <ul className="flex flex-wrap gap-2" aria-label={t("listFilters.active")}>
            {activeFilters.map((filter) => (
              <li
                key={filter.key}
                data-testid="active-filter"
                className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-100 pr-1 pl-3 text-[13px] font-bold text-brand-800"
              >
                {filter.label}
                <button
                  type="button"
                  onClick={filter.onRemove}
                  aria-label={filter.removeLabel}
                  // The chip is 32 px; the ::after widens the tap area to 44 px.
                  className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-brand-800 after:absolute after:-inset-2.5 after:content-[''] hover:bg-brand-200 focus-visible:outline-2 focus-visible:outline-brand-800"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
