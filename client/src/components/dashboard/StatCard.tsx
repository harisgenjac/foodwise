import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import UnitChips from "./UnitChips.js";

type StatTone = "orange" | "amber" | "green" | "red" | "gray";

const TONE_STYLES: Record<StatTone, string> = {
  orange: "bg-orange-50 text-orange-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-600",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  // Optional other units of the same total, shown as chips under the value.
  units?: string[];
  tone?: StatTone;
  // Extra content under the value (a detail line or a usage bar).
  children?: ReactNode;
}

function StatCard({ icon: Icon, label, value, units = [], tone = "orange", children }: StatCardProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
        <UnitChips units={units} />
        {children}
      </div>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_STYLES[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
    </div>
  );
}

export default StatCard;
