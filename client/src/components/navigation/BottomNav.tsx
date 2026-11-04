import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { BOTTOM_NAV_ITEMS, type BottomNavRole } from "./bottomNavItems.js";

interface BottomNavProps {
  role: BottomNavRole;
  // "More" opens the drawer with every link.
  onOpenMore: () => void;
  isMoreOpen: boolean;
  // The account setup is unfinished: dimmed and unusable, like the sidebar.
  locked?: boolean;
}

const itemStyle = "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight transition-colors";

// The phone bar of a store or restaurant (below md). Layout gives <main> bottom padding for it.
function BottomNav({ role, onOpenMore, isMoreOpen, locked = false }: BottomNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("bottomNav.label")}
      aria-disabled={locked}
      inert={locked}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden ${
        locked ? "pointer-events-none select-none opacity-50" : ""
      }`}
    >
      <ul className="flex">
        {BOTTOM_NAV_ITEMS[role].map(({ to, labelKey, icon: Icon }) => (
          <li key={to} className="flex flex-1">
            <NavLink
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                `${itemStyle} ${isActive ? "font-medium text-orange-600" : "text-gray-500 hover:text-gray-900"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-orange-500" />}
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                  <span className="max-w-full truncate">{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            className={`${itemStyle} cursor-pointer text-gray-500 hover:text-gray-900`}
          >
            <Menu className="h-5 w-5 shrink-0" strokeWidth={1.8} />
            <span className="max-w-full truncate">{t("bottomNav.more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default BottomNav;
