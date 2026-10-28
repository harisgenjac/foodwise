import { useTranslation } from "react-i18next";
import { usageBarColor, usagePercent } from "../../utils/credits.js";

interface UsageBarProps {
  used: number;
  total: number;
  // The accessible name, e.g. the branch the bar belongs to.
  label: string;
  className?: string;
}

// A month's used share of its credits as a small bar with "used / total", in the Credits page
// colours (green up to 70%, orange to 90%, red from 90%).
function UsageBar({ used, total, label, className = "" }: UsageBarProps) {
  const { t } = useTranslation();
  const percent = usagePercent(used, total);
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between gap-2 text-xs text-gray-600">
        <span className="tabular-nums">{t("credits.usage.usedOfTotal", { used, total })}</span>
        <span className="font-semibold tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-gray-100"
      >
        <div className={`h-full rounded-full ${usageBarColor(percent)}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default UsageBar;
