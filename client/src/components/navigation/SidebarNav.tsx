import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { useLiveOrderRefresh } from "../../context/LiveEventsContext.js";
import { NavLink, useLocation } from "react-router-dom";
import api from "../../api/axios.js";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ClipboardList,
  ReceiptText,
  Coins,
  CreditCard,
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
  Search,
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
  // A count shown next to the label (pending credit requests for admins, branch top-ups waiting
  // for a headquarters, a store's orders waiting for its answer).
  badge?: number;
  // "accent": an orange badge for something that needs an answer soon.
  badgeTone?: "brand" | "accent";
}

interface SidebarNavProps {
  // Labels shown (the open rail and the phone drawer) or icons only (the collapsed rail).
  expanded: boolean;
  // `locked`: the account setup is unfinished, so the badge counts are not loaded.
  locked?: boolean;
  // Called after a link is followed (the drawer closes).
  onNavigate?: () => void;
  // The links replace the current history entry. The drawer passes it: that entry is the drawer's
  // own (useOverlay), so Back after following a link goes to the page before, not the same page.
  replace?: boolean;
}

// The role's links, shared by the desktop rail (Sidebar) and the phone drawer (MobileDrawer).
function SidebarNav({ expanded, locked = false, onNavigate, replace = false }: SidebarNavProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const isCompany = user?.role === "COMPANY";
  const isStore = user?.role === "STORE";
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  // Admins see how many credit requests wait for a decision; reloaded on every page change.
  useEffect(() => {
    if (!isAdmin || locked) return;
    api
      .get("/admin/credits/requests/pending-count")
      .then((response) => setPendingRequests(response.data.count))
      .catch((err) => console.error("Error loading pending credit requests:", err));
  }, [isAdmin, locked, pathname]);

  // A headquarters sees how many of its branches' top-up requests wait for it.
  useEffect(() => {
    if (!isCompany || locked) return;
    api
      .get("/company/credits/branch-requests/count")
      .then((response) => setPendingRequests(response.data.count))
      .catch((err) => console.error("Error loading branch credit requests:", err));
  }, [isCompany, locked, pathname]);

  // A store sees how many orders wait for its answer: loaded on every page change and again when
  // one of its orders changes (the live events).
  const loadPendingOrders = useCallback(() => {
    if (!isStore || locked) return;
    api
      .get("/orders/store", { params: { status: "Pending", limit: 1 } })
      .then((response) => setPendingOrders(response.data.total))
      .catch((err) => console.error("Error loading pending orders:", err));
  }, [isStore, locked]);

  useEffect(() => {
    loadPendingOrders();
  }, [loadPendingOrders, pathname]);

  useLiveOrderRefresh(loadPendingOrders);

  // The store home page's design (design/store-home/store.dc.html) orders the first six; the pages
  // it does not show (pickups, add product, my profile) follow them.
  const storeLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-products", label: t("sidebar.myProducts"), icon: Package },
    { to: "/orders", label: t("sidebar.orders"), icon: ReceiptText, badge: pendingOrders, badgeTone: "accent" },
    { to: "/packing", label: t("sidebar.packing"), icon: ClipboardList },
    { to: "/reports", label: t("sidebar.reports"), icon: FileChartColumn },
    { to: "/credits", label: t("sidebar.credits"), icon: Coins },
    { to: "/pickups", label: t("sidebar.pickups"), icon: PackageCheck },
    { to: "/add-product", label: t("sidebar.addProduct"), icon: PackagePlus },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
  ];

  const restaurantLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
    { to: "/stores", label: t("sidebar.stores"), icon: Store },
    { to: "/search", label: t("sidebar.search"), icon: Search },
    { to: "/my-orders", label: t("sidebar.myOrders"), icon: ReceiptText },
    { to: "/reports", label: t("sidebar.reports"), icon: FileChartColumn },
  ];

  const humanitarianLinks: SidebarLink[] = [
    { to: "/donate-food", label: t(isStore ? "sidebar.donateFoodStore" : "sidebar.donateFood"), icon: HeartHandshake },
    { to: "/sponsor", label: t("sidebar.sponsor"), icon: Handshake },
  ];

  // A company headquarters manages its chain only; it never acts as a store.
  const companyLinks: SidebarLink[] = [
    { to: "/dashboard", label: t("sidebar.companyOverview"), icon: LayoutDashboard },
    { to: "/company/branches", label: t("sidebar.companyBranches"), icon: Store },
    { to: "/company/credits", label: t("sidebar.companyCredits"), icon: CreditCard, badge: pendingRequests },
    { to: "/company/reports", label: t("sidebar.companyReports"), icon: FileChartColumn },
    { to: "/company/profile", label: t("sidebar.companyProfile"), icon: Building2 },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
  ];

  const adminLinks: SidebarLink[] = [
    { to: "/admin", label: t("sidebar.adminDashboard"), icon: ShieldCheck },
    { to: "/admin/users", label: t("sidebar.adminUsers"), icon: Users },
    { to: "/admin/users/new", label: t("sidebar.adminNewUser"), icon: UserPlus },
    { to: "/admin/companies", label: t("sidebar.adminCompanies"), icon: Building2 },
    { to: "/admin/products", label: t("sidebar.adminProducts"), icon: Package },
    { to: "/admin/orders", label: t("sidebar.adminOrders"), icon: ReceiptText },
    { to: "/admin/donations", label: t("sidebar.adminDonations"), icon: HeartHandshake },
    { to: "/admin/credits", label: t("sidebar.adminCredits"), icon: Coins },
    { to: "/admin/credit-requests", label: t("sidebar.adminCreditRequests"), icon: Inbox, badge: pendingRequests },
    { to: "/admin/announcements", label: t("sidebar.adminAnnouncements"), icon: Megaphone },
    { to: "/admin/actions", label: t("sidebar.adminActions"), icon: ClipboardList },
    { to: "/my-profile", label: t("sidebar.myProfile"), icon: UserRound },
  ];

  const links = isAdmin
    ? adminLinks
    : isCompany
      ? companyLinks
      : user?.role === "STORE"
        ? storeLinks
        : restaurantLinks;

  const renderLink = ({ to, label, icon: Icon, badge, badgeTone = "brand" }: SidebarLink) => (
    <li key={to}>
      <NavLink
        to={to}
        // /admin, /admin/users and /admin/companies would otherwise also be active on their sub-pages.
        end={to === "/admin" || to === "/admin/users" || to === "/admin/companies"}
        title={expanded ? undefined : label}
        aria-label={label}
        onClick={onNavigate}
        replace={replace}
        className={({ isActive }) =>
          `relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors ${
            expanded ? "px-3" : "justify-center px-0"
          } ${
            isActive
              ? "bg-brand-50 text-brand-800 font-medium"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-800" />
            )}
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
            {expanded && <span className="truncate">{label}</span>}
            {badge !== undefined && badge > 0 && (
              <span
                data-testid="sidebar-badge"
                className={`rounded-full text-xs font-semibold text-white ${badgeTone === "accent" ? "bg-accent-700" : "bg-brand-800"} ${
                  expanded ? "ml-auto px-2 py-0.5" : "absolute right-2 top-1 h-2 w-2"
                }`}
              >
                {expanded ? badge : null}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );

  return (
    <nav className="px-3 py-4">
      <ul className="space-y-1">{links.map(renderLink)}</ul>

      {!isAdmin && !isCompany && (
        <>
          <div className="my-4 border-t border-neutral-100" />
          {expanded && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {t("sidebar.humanitarian")}
            </p>
          )}
          <ul className="space-y-1">{humanitarianLinks.map(renderLink)}</ul>
        </>
      )}
    </nav>
  );
}

export default SidebarNav;
