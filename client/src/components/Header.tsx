import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import { useNavigate, useLocation, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from "lucide-react";
import logo from "../assets/logoApp.png";
import { useNotifications } from "../context/NotificationsContext.js";
import LanguageSwitcher from "./LanguageSwitcher.js";
import NotificationItem from "./notifications/NotificationItem.js";
import { MOBILE_DRAWER_ID } from "./navigation/MobileDrawer.js";

const DROPDOWN_LIMIT = 8;

interface HeaderProps {
  // The desktop rail (md and up).
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  // The phone drawer (below md).
  isMenuOpen?: boolean;
  onOpenMenu?: () => void;
  // While the account setup is unfinished only the profile menu (and the language) can be used.
  locked?: boolean;
}

function Header({ isSidebarOpen, onToggleSidebar, isMenuOpen = false, onOpenMenu, locked = false }: HeaderProps) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  // Logo URL that failed to load, so the avatar falls back to initials; a new upload gets a new URL.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const notifRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // A page change closes both dropdowns (the bottom bar and links outside the header navigate too).
  useEffect(() => {
    setIsNotifOpen(false);
    setIsDropdownOpen(false);
  }, [pathname]);

  // Escape closes an open dropdown and gives focus back to its button.
  useEffect(() => {
    if (!isNotifOpen && !isDropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isNotifOpen) bellRef.current?.focus();
      if (isDropdownOpen) profileButtonRef.current?.focus();
      setIsNotifOpen(false);
      setIsDropdownOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isNotifOpen, isDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setIsNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Error logging out:", err);
      toast.error(t("header.logoutError"));
    }
  };

  const toggleLabel = isSidebarOpen
    ? t("header.collapseSidebar")
    : t("header.expandSidebar");
  const ToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen;
  // A branch (a store of a company) shows its name and its chain instead of the role.
  const isBranch = user?.role === "STORE" && Boolean(user.company_name);
  const roleLabel = isBranch
    ? t("header.branchOf", { branch: user?.business_name ?? "", company: user?.company_name ?? "" })
    : user?.role === "ADMIN"
      ? t("auth.adminRole")
      : user?.role === "COMPANY"
        ? t("auth.companyRole")
        : user?.role === "STORE"
          ? t("auth.storeRole")
          : t("auth.restaurantRole");
  // A company headquarters login shows its company's logo, a branch without its own logo too.
  const avatarUrl =
    user?.role === "COMPANY" ? user.company_logo_url : user?.logo_url || (isBranch ? user?.company_logo_url : null);
  // Accounts created by an admin have no name until the profile is filled in.
  const fullName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const displayName = fullName || user?.business_name || user?.email || "";
  const initials = fullName
    ? `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`
    : displayName.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-16 px-4 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Phones open the drawer; from md up the same place collapses the rail. */}
        <button
          type="button"
          onClick={onOpenMenu}
          disabled={locked}
          aria-label={t("header.openMenu")}
          aria-haspopup="dialog"
          aria-expanded={isMenuOpen}
          aria-controls={isMenuOpen ? MOBILE_DRAWER_ID : undefined}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <button
          onClick={onToggleSidebar}
          disabled={locked}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="hidden md:inline-flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ToggleIcon className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <Link
          to="/dashboard"
          aria-disabled={locked}
          tabIndex={locked ? -1 : undefined}
          className={`flex items-center gap-2 ${locked ? "pointer-events-none" : ""}`}
        >
          <img src={logo} alt="FoodWise" className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
          <span className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            Food<span className="text-orange-600">Wise</span>
          </span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center sm:gap-1">
        <LanguageSwitcher />

        <div className="relative" ref={notifRef}>
          <button
            ref={bellRef}
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            disabled={locked}
            aria-label={t("header.notificationsLabel")}
            aria-expanded={isNotifOpen}
            // 44 px touch target below md; the icon keeps its size.
            className="relative flex h-11 w-11 items-center justify-center md:h-auto md:w-auto md:p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Bell className="h-5 w-5" strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            // Header and footer stay fixed; only the list scrolls, so "view all" is always visible.
            // Below sm a full-width panel fixed under the header (the dropdown would be cut off at the
            // left edge); from sm up a dropdown under the bell.
            <div
              data-testid="notifications-panel"
              className="fixed inset-x-0 top-16 z-50 flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden border-y border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-96 sm:rounded-2xl sm:border sm:pb-0"
            >
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {t("header.notificationsLabel")}
                  </span>
                  {unreadCount > 0 && (
                    <span className="min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs font-semibold leading-5 text-white">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {t("notifications.markAllReadShort")}
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <BellOff className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <p className="text-sm text-gray-500">{t("header.noNotifications")}</p>
                </div>
              ) : (
                <div data-testid="notifications-list" className="min-h-0 flex-1 divide-y divide-gray-50 overflow-y-auto sm:max-h-[22rem] sm:flex-none">
                  {notifications.slice(0, DROPDOWN_LIMIT).map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      compact
                      onNavigate={() => setIsNotifOpen(false)}
                    />
                  ))}
                </div>
              )}

              <Link
                to="/notifications"
                onClick={() => setIsNotifOpen(false)}
                className="group flex items-center justify-center gap-1 border-t border-gray-100 bg-gray-50/60 p-3 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50"
              >
                {t("header.viewAllNotifications")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>

        <div className="relative sm:ml-1" ref={profileRef}>
          <button
            ref={profileButtonRef}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            // Below md only the 36 px avatar shows, so p-1 makes it a 44 px target.
            className="flex items-center gap-2 p-1 md:pr-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {avatarUrl && failedLogo !== avatarUrl ? (
              <img
                src={assetUrl(avatarUrl)}
                alt={displayName}
                onError={() => setFailedLogo(avatarUrl)}
                className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold flex items-center justify-center">
                {initials}
              </span>
            )}
            <span className="hidden md:flex flex-col items-start leading-tight">
              <span className="text-sm font-medium text-gray-800">{displayName}</span>
              <span className="text-xs text-gray-500">{roleLabel}</span>
            </span>
            <ChevronDown
              className={`hidden md:block h-4 w-4 text-gray-400 transition-transform ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-800 truncate">{displayName}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </div>
              <Link
                to="/my-profile"
                className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 md:min-h-0"
                onClick={() => setIsDropdownOpen(false)}
              >
                <UserRound className="h-4 w-4" />
                {t("sidebar.myProfile")}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex min-h-11 items-center gap-2 text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer md:min-h-0"
              >
                <LogOut className="h-4 w-4" />
                {t("header.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
