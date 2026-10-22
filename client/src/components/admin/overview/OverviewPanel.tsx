import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface OverviewPanelProps {
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  // "View all" link to the admin list behind the numbers.
  link?: { to: string; label: string };
  className?: string;
  children: React.ReactNode;
}

// One area of the admin overview: a white card with a title row and its content.
function OverviewPanel({ title, icon: Icon, subtitle, link, className = "", children }: OverviewPanelProps) {
  return (
    <section className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {link && (
          <Link
            to={link.to}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            {link.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default OverviewPanel;
