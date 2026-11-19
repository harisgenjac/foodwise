import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import Logo from "../brand/Logo.js";
import SidebarNav from "./SidebarNav.js";
import { useOverlay } from "../../hooks/useOverlay.js";

export const MOBILE_DRAWER_ID = "mobile-drawer";

// From md up the rail takes over; an open drawer then closes.
const DESKTOP_QUERY = "(min-width: 48rem)";

// The phone navigation (below md): every link of the role in a panel over the page. Rendered only
// while open. Closes on a link, the backdrop, the close button, Escape, Back and any page change;
// focus moves into it and goes back to the button that opened it (the header menu button or
// "More"). Links replace the drawer's history entry, so Back then leaves the new page.
function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedOn = useRef(pathname);
  useOverlay({ onClose, containerRef: panelRef });

  useEffect(() => {
    if (pathname !== openedOn.current) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
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

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div data-testid="mobile-drawer-backdrop" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        id={MOBILE_DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label={t("sidebar.menu")}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl outline-none"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 px-4">
          <Link to="/dashboard" replace onClick={onClose} className="flex items-center gap-2">
            <Logo variant="full" className="h-10 w-10" textClassName="text-xl" />
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("sidebar.closeMenu")}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <SidebarNav expanded onNavigate={onClose} replace />
        </div>
      </div>
    </div>
  );
}

export default MobileDrawer;
