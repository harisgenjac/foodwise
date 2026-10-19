import type { LucideIcon } from "lucide-react";

interface DetailItemProps {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClassName?: string;
}

// One icon + label/value entry; place inside a <dl> grid on a bg-gray-50 panel.
function DetailItem({ icon: Icon, label, value, valueClassName = "text-gray-900" }: DetailItemProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className={`font-semibold ${valueClassName}`}>{value}</dd>
      </div>
    </div>
  );
}

export default DetailItem;
