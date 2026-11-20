import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getAccountSetup } from '../utils/accountSetup.js';
import Header from './Header.js';
import Sidebar from './Sidebar.js';
import MobileDrawer from './navigation/MobileDrawer.js';
import BottomNav from './navigation/BottomNav.js';
import { hasBottomNav } from './navigation/bottomNavItems.js';
import AccountSetupGate from './AccountSetupGate.js';
import AnnouncementBanner from './AnnouncementBanner.js';
import Footer from './Footer.js';
import { NotificationsProvider } from '../context/NotificationsContext.js';
import { LiveEventsProvider } from '../context/LiveEventsContext.js';
import { CreditsProvider } from '../context/CreditsContext.js';
import { CartProvider } from '../context/CartContext.js';
import CreditBanner from './credits/CreditBanner.js';

// The desktop rail's open/collapsed state. Phones ignore it: their drawer always starts closed.
const SIDEBAR_STORAGE_KEY = 'sidebarOpen';

function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(readSidebarOpen);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const setup = getAccountSetup(user);
  const bottomNavRole = hasBottomNav(user?.role) ? user.role : null;
  // The restaurant home page ends with its donation band, which the footer's arch overlaps.
  const flushFooter = user?.role === 'RESTAURANT' && pathname === '/dashboard' && !setup.locked;

  function onToggleSidebar() {
    const next = !isSidebarOpen;
    setIsSidebarOpen(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // storage unavailable: the state still works for this session
    }
  }

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // The window scrolls (not <main>), so a new page starts at the top.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);

  return (
    // A temporary password blocks every other API call, so live events and notifications wait until
    // it is replaced.
    <LiveEventsProvider enabled={!setup.needsPassword}>
    <NotificationsProvider enabled={!setup.needsPassword}>
      {/* Only stores pay credits (restaurants order for free), and only once the account is set up. */}
      <CreditsProvider enabled={user?.role === "STORE" && !setup.locked}>
      {/* Only restaurants order, from one cart. */}
      <CartProvider enabled={user?.role === "RESTAURANT" && !setup.locked}>
        <div className="flex min-h-dvh flex-col bg-neutral-50">
          {/* Printing a page (the packing list) prints only its content: the app's frame stays on screen. */}
          <div className="contents print:hidden">
            <Header
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={onToggleSidebar}
              isMenuOpen={isMenuOpen}
              onOpenMenu={openMenu}
              locked={setup.locked}
            />
          </div>
          <div className="flex flex-1">
            <div className="contents print:hidden">
              <Sidebar isSidebarOpen={isSidebarOpen} locked={setup.locked} />
            </div>
            {/* A flex column, so the footer sits at the bottom of short pages and after the content of long
                ones, across the whole content width. With the bottom bar, the footer keeps room above it. */}
            {/* The footer follows <main> (not inside it), so it is the page's contentinfo landmark. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <main className={`flex-1 px-4 pt-6 sm:px-6 print:pb-0 ${flushFooter ? '' : 'pb-6'}`}>
                <div className="contents print:hidden">
                  {!setup.locked && <AnnouncementBanner />}
                  {!setup.locked && <CreditBanner />}
                  <AccountSetupGate />
                </div>
                <Outlet />
              </main>
              <div className="contents print:hidden">
                <Footer flush={flushFooter} bottomNavSpace={bottomNavRole !== null} />
              </div>
            </div>
          </div>
          <div className="contents print:hidden">
            {isMenuOpen && !setup.locked && <MobileDrawer onClose={closeMenu} />}
            {bottomNavRole && (
              <BottomNav role={bottomNavRole} onOpenMore={openMenu} isMoreOpen={isMenuOpen} locked={setup.locked} />
            )}
          </div>
        </div>
      </CartProvider>
      </CreditsProvider>
    </NotificationsProvider>
    </LiveEventsProvider>
  );
}

export default Layout;
