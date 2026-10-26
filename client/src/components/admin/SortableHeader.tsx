import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDir } from "../../hooks/useAdminPage.js";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  // The table's current sort (useAdminSort).
  sort: string;
  dir: SortDir | "";
  onSort: (key: string) => void;
  className?: string;
}

// A column title of an admin table that sorts it: a button that cycles unsorted → ascending →
// descending (useAdminSort). Gray arrows mean "not sorted"; an orange arrow shows the direction.
function SortableHeader({ label, sortKey, sort, dir, onSort, className = "px-4 py-3" }: SortableHeaderProps) {
  const active = sort === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={className} aria-sort={!active ? "none" : dir === "desc" ? "descending" : "ascending"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1 rounded font-semibold uppercase tracking-wider transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
          active ? "text-gray-800" : ""
        }`}
      >
        {label}
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${active ? "text-orange-500" : "text-gray-400"}`} />
      </button>
    </th>
  );
}

export default SortableHeader;
