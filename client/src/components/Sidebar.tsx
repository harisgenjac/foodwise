import { useAuth } from "../context/AuthContext.js";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  Handshake,
  HeartHandshake,
  LayoutDashboard,
  Package,
  PackagePlus,
  ShoppingBasket,
  Store,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SidebarLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

function Sidebar({ isSidebarOpen }: { isSidebarOpen: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const storeLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
    { to: "/add-product", label: t("sidebar.addProduct"), icon: PackagePlus },
    { to: "/my-products", label: t("sidebar.myProducts"), icon: Package },
    { to: "/reservations", label: t("sidebar.reservations"), icon: CalendarCheck },
  ];

  const restaurantLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
    { to: "/stores", label: t("sidebar.stores"), icon: Store },
    { to: "/browse-products", label: t("sidebar.browseProducts"), icon: ShoppingBasket },
    { to: "/my-reservations", label: t("sidebar.myReservations"), icon: CalendarCheck },
  ];

  const humanitarianLinks: SidebarLink[] = [
    { to: "/donate-food", label: t("sidebar.donateFood"), icon: HeartHandshake },
    { to: "/sponsor", label: t("sidebar.sponsor"), icon: Handshake },
  ];

  const links = user?.role === "STORE" ? storeLinks : restaurantLinks;

  const renderLink = ({ to, label, icon: Icon }: SidebarLink) => (
    <li key={to}>
      <NavLink
        to={to}
        title={isSidebarOpen ? undefined : label}
        aria-label={label}
        className={({ isActive }) =>
          `relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors ${
            isSidebarOpen ? "px-3" : "justify-center px-0"
          } ${
            isActive
              ? "bg-orange-50 text-orange-600 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-orange-500" />
            )}
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
            {isSidebarOpen && <span className="truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </li>
  );

  return (
    <aside
      className={`shrink-0 overflow-y-auto overflow-x-hidden bg-white border-r border-gray-200 transition-all duration-300 ${
        isSidebarOpen ? "w-64" : "w-20"
      }`}
    >
      <nav className="px-3 py-4">
        <ul className="space-y-1">{links.map(renderLink)}</ul>

        <div className="my-4 border-t border-gray-100" />
        {isSidebarOpen && (
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t("sidebar.humanitarian")}
          </p>
        )}
        <ul className="space-y-1">{humanitarianLinks.map(renderLink)}</ul>
      </nav>
    </aside>
  );
}

export default Sidebar;
