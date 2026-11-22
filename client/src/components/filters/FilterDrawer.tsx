import { useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Filter, Trash2, X } from "lucide-react";
import { useOverlay } from "../../hooks/useOverlay.js";

interface FilterDrawerProps {
  // The panel's id, for the FilterBar button's aria-controls.
  id: string;
  onClose: () => void;
  // Clears every filter in the panel (the search stays).
  onClear: () => void;
  // The filter fields (FilterField, FilterPills).
  children: ReactNode;
}

// The app-wide filter panel (design/stores/stores-filters.html): rendered only while open, it
// slides in from the right (full width on phones, 420 px from sm up) over a dark overlay, with
// "Filteri", the fields, and "Očisti" / "Zatvori" at the bottom. Filters apply as they change, so
// "Zatvori" only closes. Focus moves into it and stays inside; Escape, the overlay, the close
// buttons and Back close it, and focus goes back to the "Filteri" button (useOverlay).
function FilterDrawer({ id, onClose, onClear, children }: FilterDrawerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useOverlay({ onClose, containerRef: panelRef });

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("listFilters.closePanel")}
        onClick={onClose}
        data-testid="filter-drawer-overlay"
        className="absolute inset-0 cursor-pointer bg-neutral-900/40"
      />
      <aside
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col gap-7 overflow-y-auto overscroll-contain bg-white px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[-12px_0_40px_rgba(28,25,23,0.18)] outline-none motion-safe:animate-drawer-in sm:w-[420px] sm:px-7"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-50 text-brand-800">
              <Filter className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id={titleId} className="text-[22px] font-extrabold tracking-[-0.01em] text-neutral-900">
              {t("listFilters.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("listFilters.closePanel")}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-900 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {children}

        <div className="mt-auto flex gap-3 border-t border-[#EEEDEB] pt-5 sm:mt-0">
          <button
            type="button"
            onClick={onClear}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white text-[15px] font-bold text-neutral-600 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
            {t("listFilters.clear")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full bg-brand-800 text-[15px] font-bold text-white hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            {t("listFilters.close")}
          </button>
        </div>
      </aside>
    </div>
  );
}

// One labelled field in the panel ("Grad" with its select).
export function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-neutral-900">
        {label}
      </label>
      {children}
    </div>
  );
}

interface FilterPillsProps<V extends string> {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

// A one-of choice as pill buttons ("Udaljenost": Do 5 km … Bez ograničenja), each 44 px high with
// aria-pressed.
export function FilterPills<V extends string>({ label, options, value, onChange }: FilterPillsProps<V>) {
  const labelId = useId();
  return (
    <div>
      <div id={labelId} className="mb-2.5 text-sm font-semibold text-neutral-900">
        {label}
      </div>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`h-11 cursor-pointer rounded-full border px-4 text-sm font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
                selected
                  ? "border-brand-800 bg-brand-800 text-white"
                  : "border-neutral-200 bg-white text-neutral-900 hover:border-brand-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default FilterDrawer;
