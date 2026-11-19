import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: { to: string; label: string };
  // A second, quieter button next to the action, e.g. switching to another tab.
  secondaryAction?: { label: string; onClick: () => void };
}

function EmptyState({ icon: Icon, title, subtitle, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 bg-white/60 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Icon className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <div>
        <h3 className="text-lg font-semibold text-neutral-800">{title}</h3>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-900"
            >
              {secondaryAction.label}
            </button>
          )}
          {action && (
            <Link
              to={action.to}
              className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-900"
            >
              {action.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
