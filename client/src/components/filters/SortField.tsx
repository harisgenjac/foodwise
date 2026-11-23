import { useTranslation } from "react-i18next";
import { ArrowUpDown, ChevronDown } from "lucide-react";

export const FILTER_SELECT_CLASS =
  "h-12 w-full cursor-pointer appearance-none rounded-xl border border-neutral-200 bg-white pr-10 pl-11 text-base text-neutral-900 outline-none focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]";

interface SortFieldProps<V extends string> {
  id: string;
  value: V;
  onChange: (value: V) => void;
  // Each option's i18n key.
  options: readonly { value: V; label: string }[];
}

// The sort under the FilterBar (design/search/search.html): "Sortiraj po" and a select, aligned right.
function SortField<V extends string>({ id, value, onChange, options }: SortFieldProps<V>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <label htmlFor={id} className="text-sm font-semibold text-neutral-600">
        {t("filters.sortBy")}
      </label>
      <span className="relative block w-full max-w-[230px] min-w-0 flex-1 sm:flex-none">
        <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
        <select id={id} value={value} onChange={(event) => onChange(event.target.value as V)} className={`${FILTER_SELECT_CLASS} font-semibold`}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-600" aria-hidden="true" />
      </span>
    </div>
  );
}

export default SortField;
