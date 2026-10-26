import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: ReactNode;
  to?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const linkStyle = "block max-w-48 truncate transition-colors hover:text-orange-600";

const titleOf = (label: ReactNode) => (typeof label === "string" ? label : undefined);

// Where a detail page sits in the app (not browsing history). The last item is the page itself, unless it has a
// `to`: a not-found page passes only the parent, which then stays a link. Below sm only "‹ parent" is shown.
function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  const { t } = useTranslation();
  const last = items[items.length - 1];
  const current = last && !last.to ? last : null;
  const parent = (current ? items.slice(0, -1) : items).at(-1);

  return (
    <nav aria-label={t("breadcrumbs.label")} className={`text-sm text-gray-500 ${className}`}>
      {parent?.to && (
        <Link
          to={parent.to}
          title={titleOf(parent.label)}
          className="inline-flex max-w-full items-center gap-1 transition-colors hover:text-orange-600 sm:hidden"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      <ol className="hidden min-w-0 items-center gap-1.5 sm:flex">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />}
            {item === current || !item.to ? (
              <span
                aria-current={item === current ? "page" : undefined}
                title={titleOf(item.label)}
                className="block max-w-64 truncate font-medium text-gray-700"
              >
                {item.label}
              </span>
            ) : (
              <Link to={item.to} title={titleOf(item.label)} className={linkStyle}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Stands in for a record's name while it loads.
export function BreadcrumbPlaceholder() {
  const { t } = useTranslation();
  return (
    <>
      <span className="inline-block h-3 w-24 animate-pulse rounded bg-gray-200 align-middle" aria-hidden="true" />
      <span className="sr-only">{t("common.loading")}</span>
    </>
  );
}

export default Breadcrumbs;
