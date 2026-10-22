import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { NavLink, useLocation } from "react-router-dom";
import api from "../api/axios.js";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  ClipboardList,
  Coins,
  FileChartColumn,
  Handshake,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Package,
  PackageCheck,
  PackagePlus,
  ShieldCheck,
  ShoppingBasket,
  Store,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SidebarLink {
  to: string;
  label: string;
  icon: LucideIcon;
  // A count shown next to the label (pending credit requests for admins).
  badge?: number;
}

// `locked`: the account setup is unfinished, so no page but My profile (from the header) is reachable.
function Sidebar({ isSidebarOpen, locked = false }: { isSidebarOpen: boolean; locked?: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const [pendingRequests, setPendingRequests] = useState(0);

  // Admins see how many credit requests wait for a decision; reloaded on every page change.
  useEffect(() => {
    if (!isAdmin || locked) return;
    api
      .get("/admin/credits/requests/pending-count")
      .then((response) => setPendingRequests(response.data.count))
      .catch((err) => console.error("Error loading pending credit requests:", err));
  }, [isAdmin, locked, pathname]);

  const storeLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
    { to: "/add-product", label: t("sidebar.addProduct"), icon: PackagePlus },
    { to: "/my-products", label: t("sidebar.myProducts"), icon: Package },
    { to: "/reservations", label: t("sidebar.reservations"), icon: CalendarCheck },
    { to: "/pickups", label: t("sidebar.pickups"), icon: PackageCheck },
    { to: "/reports", label: t("sidebar.reports"), icon: FileChartColumn },
    { to: "/credits", label: t("sidebar.credits"), icon: Coins },
  ];

  const restaurantLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
    { to: "/stores", label: t("sidebar.stores"), icon: Store },
    { to: "/browse-products", label: t("sidebar.browseProducts"), icon: ShoppingBasket },
    { to: "/my-reservations", label: t("sidebar.myReservations"), icon: CalendarCheck },
    { to: "/pickups", label: t("sidebar.pickups"), icon: PackageCheck },
    { to: "/reports", label: t("sidebar.reports"), icon: FileChartColumn },
    { to: "/credits", label: t("sidebar.credits"), icon: Coins },
  ];

  const humanitarianLinks: SidebarLink[] = [
    { to: "/donate-food", label: t("sidebar.donateFood"), icon: HeartHandshake },
    { to: "/sponsor", label: t("sidebar.sponsor"), icon: Handshake },
  ];

  const adminLinks: SidebarLink[] = [
    { to: "/admin", label: t("sidebar.adminDashboard"), icon: ShieldCheck },
    { to: "/admin/users", label: t("sidebar.adminUsers"), icon: Users },
    { to: "/admin/users/new", label: t("sidebar.adminNewUser"), icon: UserPlus },
    { to: "/admin/products", label: t("sidebar.adminProducts"), icon: Package },
    { to: "/admin/reservations", label: t("sidebar.adminReservations"), icon: CalendarCheck },
    { to: "/admin/donations", label: t("sidebar.adminDonations"), icon: HeartHandshake },
    { to: "/admin/credits", label: t("sidebar.adminCredits"), icon: Coins },
    { to: "/admin/credit-requests", label: t("sidebar.adminCreditRequests"), icon: Inbox, badge: pendingRequests },
    { to: "/admin/announcements", label: t("sidebar.adminAnnouncements"), icon: Megaphone },
    { to: "/admin/actions", label: t("sidebar.adminActions"), icon: ClipboardList },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
  ];

  const links = isAdmin ? adminLinks : user?.role === "STORE" ? storeLinks : restaurantLinks;

  const renderLink = ({ to, label, icon: Icon, badge }: SidebarLink) => (
    <li key={to}>
      <NavLink
        to={to}
        // /admin and /admin/users would otherwise also be active on their sub-pages.
        end={to === "/admin" || to === "/admin/users"}
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
            {badge !== undefined && badge > 0 && (
              <span
                className={`rounded-full bg-orange-500 text-xs font-semibold text-white ${
                  isSidebarOpen ? "ml-auto px-2 py-0.5" : "absolute right-2 top-1 h-2 w-2"
                }`}
              >
                {isSidebarOpen ? badge : null}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );

  return (
    <aside
      className={`shrink-0 overflow-y-auto overflow-x-hidden bg-white border-r border-gray-200 transition-all duration-300 ${
        isSidebarOpen ? "w-64" : "w-20"
      } ${locked ? "pointer-events-none select-none opacity-50" : ""}`}
      aria-disabled={locked}
      inert={locked}
    >
      <nav className="px-3 py-4">
        <ul className="space-y-1">{links.map(renderLink)}</ul>

        {!isAdmin && (
          <>
            <div className="my-4 border-t border-gray-100" />
            {isSidebarOpen && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t("sidebar.humanitarian")}
              </p>
            )}
            <ul className="space-y-1">{humanitarianLinks.map(renderLink)}</ul>
          </>
        )}
      </nav>
    </aside>
  );
}

export default Sidebar;
