import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AttentionItem {
  icon: LucideIcon;
  text: string;
  to: string;
}

// What waits for the admin, as links to the matching list. The page shows the panel only
// while something waits, so there is no empty state.
function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="-mx-2 space-y-1">
      {items.map(({ icon: Icon, text, to }) => (
        <li key={to + text}>
          <Link
            to={to}
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
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
