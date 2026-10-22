import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AttentionItem {
  icon: LucideIcon;
  text: string;
  count: number;
  to: string;
  tone: "amber" | "red";
}

const TONES = {
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
};

// What waits for the admin, as links to the matching list. Items with 0 are left out.
function AttentionList({ items }: { items: AttentionItem[] }) {
  const { t } = useTranslation();
  const open = items.filter((item) => item.count > 0);

  if (open.length === 0) {
    return (
      <p className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-sm font-medium text-green-700">
        <CircleCheck className="h-8 w-8 text-green-500" strokeWidth={1.6} />
        {t("admin.dashboard.allClear")}
      </p>
    );
  }

  return (
    <ul className="-mx-2 space-y-1">
      {open.map(({ icon: Icon, text, to, tone }) => (
        <li key={to + text}>
          <Link
            to={to}
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="flex-1">{text}</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default AttentionList;
