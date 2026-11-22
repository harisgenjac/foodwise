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

// The pill tabs of the store page (design/stores/): a white rounded group, the active tab filled
// brand-800 with its count on brand-900 in lime, the others grey with a grey count; 44 px high on
// phones, 40 px from sm up. Left and right arrows move between the tabs. The page renders each
// panel with role="tabpanel", id `${idPrefix}-panel-${key}` and aria-labelledby `${idPrefix}-tab-${key}`.
function Tabs<K extends string>({ tabs, active, onChange, label, idPrefix }: TabsProps<K>) {
  const move = (from: number, step: 1 | -1) => {
    const next = tabs[(from + step + tabs.length) % tabs.length]!;
    onChange(next.key);
    document.getElementById(`${idPrefix}-tab-${next.key}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex w-fit gap-1 rounded-full border border-neutral-200 bg-white p-1">
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index, 1);
              if (event.key === "ArrowLeft") move(index, -1);
            }}
            className={`flex h-11 cursor-pointer items-center gap-2 rounded-full pr-4 pl-5 text-sm font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:h-10 ${
              selected ? "bg-brand-800 text-white" : "bg-transparent text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`flex h-[22px] min-w-6 items-center justify-center rounded-full px-[7px] text-xs font-extrabold ${
                  selected ? "bg-brand-900 text-lime" : "bg-neutral-100 text-neutral-600"
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
