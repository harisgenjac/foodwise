import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SectionCardProps {
  title: string;
  icon: LucideIcon;
  viewAll: { to: string; label: string };
  isEmpty: boolean;
  empty: { icon: LucideIcon; text: string; action?: { to: string; label: string } };
  children: ReactNode;
}

function SectionCard({ title, icon: TitleIcon, viewAll, isEmpty, empty, children }: SectionCardProps) {
  const EmptyIcon = empty.icon;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
            <TitleIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          {title}
        </h2>
        <Link
          to={viewAll.to}
          className="group inline-flex min-h-11 sm:min-h-0 shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
        >
          {viewAll.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 bg-white/60 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <EmptyIcon className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <p className="text-sm text-neutral-500">{empty.text}</p>
          {empty.action && (
            <Link
              to={empty.action.to}
              className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-900"
            >
              {empty.action.label}
            </Link>
          )}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default SectionCard;
