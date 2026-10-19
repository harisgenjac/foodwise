import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from "lucide-react";
import logo from "../assets/logoApp.png";
import { useNotifications } from "../context/NotificationsContext.js";
import LanguageSwitcher from "./LanguageSwitcher.js";
import NotificationItem from "./notifications/NotificationItem.js";

const DROPDOWN_LIMIT = 8;

interface HeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function Header({ isSidebarOpen, onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  // Logo URL that failed to load, so the avatar falls back to initials; a new upload gets a new URL.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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
    await logout();
    navigate("/login");
  };

  const toggleLabel = isSidebarOpen
    ? t("header.collapseSidebar")
    : t("header.expandSidebar");
  const ToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen;
  const roleLabel =
    user?.role === "STORE" ? t("auth.storeRole") : t("auth.restaurantRole");

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-16 px-4 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
        >
          <ToggleIcon className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logo} alt="FoodWise" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Food<span className="text-orange-600">Wise</span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-1">
        <LanguageSwitcher />

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            aria-label={t("header.notificationsLabel")}
            className="relative p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
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
            <div className="absolute right-0 top-full mt-2 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl z-50">
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
                <div className="max-h-[22rem] divide-y divide-gray-50 overflow-y-auto">
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

        <div className="relative ml-1" ref={profileRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {user?.logo_url && failedLogo !== user.logo_url ? (
              <img
                src={`http://localhost:3000${user.logo_url}`}
                alt={`${user.first_name} ${user.last_name}`}
                onError={() => setFailedLogo(user.logo_url ?? null)}
                className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold flex items-center justify-center">
                {user?.first_name?.[0]}
                {user?.last_name?.[0]}
              </span>
            )}
            <span className="hidden md:flex flex-col items-start leading-tight">
              <span className="text-sm font-medium text-gray-800">
                {user?.first_name} {user?.last_name}
              </span>
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
                <p className="font-semibold text-gray-800">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </div>
              <Link
                to="/my-profile"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setIsDropdownOpen(false)}
              >
                <UserRound className="h-4 w-4" />
                {t("sidebar.myProfile")}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
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
