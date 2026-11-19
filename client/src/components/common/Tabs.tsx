interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface TabsProps<K extends string> {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
  // Names the tab list for screen readers.
  label: string;
  // Id prefix: tab `${idPrefix}-tab-${key}` controls panel `${idPrefix}-panel-${key}`.
  idPrefix: string;
}

// The pill tabs the pages use (one row, 44 px high on phones). The page renders each panel with
// role="tabpanel", id `${idPrefix}-panel-${key}` and aria-labelledby `${idPrefix}-tab-${key}`.
function Tabs<K extends string>({ tabs, active, onChange, label, idPrefix }: TabsProps<K>) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex w-fit rounded-full border border-neutral-100 bg-white p-1 shadow-sm">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:min-h-0 ${
              selected ? "bg-brand-800 text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  selected ? "bg-white/25 text-white" : "bg-brand-100 text-brand-800"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
