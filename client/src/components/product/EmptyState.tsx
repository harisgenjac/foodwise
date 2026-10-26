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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <div>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              {secondaryAction.label}
            </button>
          )}
          {action && (
            <Link
              to={action.to}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
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
