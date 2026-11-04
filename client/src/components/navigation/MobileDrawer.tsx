import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import logo from "../../assets/logoApp.png";
import SidebarNav from "./SidebarNav.js";

export const MOBILE_DRAWER_ID = "mobile-drawer";

// From md up the rail takes over; an open drawer then closes.
const DESKTOP_QUERY = "(min-width: 48rem)";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The phone navigation (below md): every link of the role in a panel over the page. Rendered only
// while open. Closes on a link, the backdrop, the close button, Escape and any page change; focus
// moves into it and goes back to the button that opened it (the header menu button or "More").
function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedOn = useRef(pathname);

  useEffect(() => {
    if (pathname !== openedOn.current) onClose();
  }, [pathname, onClose]);

  // Focus in on open, back to the opener on close; the page underneath does not scroll meanwhile.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      root.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.(DESKTOP_QUERY);
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    // Keep Tab inside the panel.
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden" onKeyDown={handleKeyDown}>
      <div data-testid="mobile-drawer-backdrop" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        id={MOBILE_DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label={t("sidebar.menu")}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2">
            <img src={logo} alt="FoodWise" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Food<span className="text-orange-600">Wise</span>
            </span>
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("sidebar.closeMenu")}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <SidebarNav expanded onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export default MobileDrawer;
