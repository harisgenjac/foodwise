export interface DistributionItem {
  label: string;
  value: number;
  // Full Tailwind background class of the segment and its legend dot.
  color: string;
}

interface DistributionBarProps {
  items: DistributionItem[];
  // Shown next to the total, e.g. "8 total".
  totalLabel: string;
  // The accessible name of the bar, e.g. "Reservations by status".
  label: string;
}

// How a total splits into parts (reservations by status, subscriptions by plan): one stacked bar
// with a 2px gap between segments, and a legend with every part's count, so identity never rests
// on color alone. Parts with 0 stay in the legend but take no space in the bar.
function DistributionBar({ items, totalLabel, label }: DistributionBarProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const visible = items.filter((item) => item.value > 0);
  const description = `${label}: ${items.map((item) => `${item.label} ${item.value}`).join(", ")}`;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">{totalLabel}</p>
      <div role="img" aria-label={description} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-gray-100">
        {visible.map((item) => (
          <div
            key={item.label}
            title={`${item.label}: ${item.value}`}
            data-testid="distribution-segment"
            className={`h-full first:rounded-l-full last:rounded-r-full ${item.color}`}
            style={{ width: `${(item.value / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-gray-600">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} />
              {item.label}
            </span>
            <span className="font-semibold tabular-nums text-gray-900">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DistributionBar;
