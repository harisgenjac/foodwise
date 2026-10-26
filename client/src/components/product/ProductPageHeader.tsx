import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

// The pluralized "N products" pill; also used on its own above a list.
export function CountPill({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex w-fit rounded-full border border-orange-100 bg-orange-50/60 px-3 py-0.5 text-xs font-semibold text-orange-700">
      {children}
    </p>
  );
}

interface ProductPageHeaderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  count?: string;
  action?: { to: string; label: string; icon: LucideIcon };
}

function ProductPageHeader({ title, subtitle, icon: TitleIcon, count, action }: ProductPageHeaderProps) {
  const ActionIcon = action?.icon;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <TitleIcon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          {count && (
            <div className="mt-2">
              <CountPill>{count}</CountPill>
            </div>
          )}
        </div>
      </div>

      {action && ActionIcon && (
        <Link
          to={action.to}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md"
        >
          <ActionIcon className="h-5 w-5" strokeWidth={1.8} />
          {action.label}
        </Link>
      )}
    </div>
  );
}

export default ProductPageHeader;
