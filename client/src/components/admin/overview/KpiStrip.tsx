import type { LucideIcon } from "lucide-react";
import UnitChips from "../../dashboard/UnitChips.js";

export interface Kpi {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  // Optional other units of the same total, shown as chips under the value.
  units?: string[];
  // Optional thin progress bar under the value, 0–100.
  progress?: number;
}

// The headline numbers of the admin overview in one panel, split by dividers (2×2 on phones).
function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value, detail, units = [], progress }, index) => (
        <div
          key={label}
          className={`p-5 ${index % 2 === 1 ? "border-l border-gray-100" : ""} ${index >= 2 ? "border-t border-gray-100 lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
          {progress !== undefined && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress}%` }} />
            </div>
          )}
          <UnitChips units={units} />
          {detail && <p className="mt-1.5 text-xs text-gray-500">{detail}</p>}
        </div>
      ))}
    </section>
  );
}

export default KpiStrip;
