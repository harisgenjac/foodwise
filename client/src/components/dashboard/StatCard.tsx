import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import UnitChips from "./UnitChips.js";

// The icon tile's colours: the status colours keep their fixed meaning, accent is for discounts.
type StatTone = "brand" | "accent" | "success" | "warning" | "danger" | "neutral";

const TONE_STYLES: Record<StatTone, string> = {
  brand: "bg-brand-50 text-brand-800",
  accent: "bg-accent-100 text-accent-700",
  success: "bg-success-100 text-success-800",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  neutral: "bg-neutral-100 text-neutral-600",
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

function StatCard({ icon: Icon, label, value, units = [], tone = "brand", children }: StatCardProps) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm sm:p-5 transition-shadow hover:shadow-md">
      <div className="min-w-0 flex-1">
        <p data-testid="stat-label" className="break-words text-sm font-medium leading-snug text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{value}</p>
        <UnitChips units={units} />
        {children}
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${TONE_STYLES[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
    </div>
  );
}

export default StatCard;
