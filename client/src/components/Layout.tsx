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
    // A temporary password blocks every other API call, so notifications wait until it is replaced.
    <NotificationsProvider enabled={!setup.needsPassword}>
      {/* Only stores pay credits (restaurants order for free), and only once the account is set up. */}
      <CreditsProvider enabled={user?.role === "STORE" && !setup.locked}>
      {/* Only restaurants order, from one cart. */}
      <CartProvider enabled={user?.role === "RESTAURANT" && !setup.locked}>
        <div className="flex min-h-dvh flex-col bg-gray-50">
          <Header
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={onToggleSidebar}
            isMenuOpen={isMenuOpen}
            onOpenMenu={openMenu}
            locked={setup.locked}
          />
          <div className="flex flex-1">
            <Sidebar isSidebarOpen={isSidebarOpen} locked={setup.locked} />
            {/* A flex column, so the footer sits at the bottom of short pages and after the content of long
                ones. With the bottom bar, the bottom padding keeps the footer and last buttons above it. */}
            <main
              className={`flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 ${
                bottomNavRole ? 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6' : 'pb-6'
              }`}
            >
              <div className="flex-1 pb-6">
                {!setup.locked && <AnnouncementBanner />}
                {!setup.locked && <CreditBanner />}
                <AccountSetupGate />
                <Outlet />
              </div>
              <Footer showImpact={!setup.needsPassword} />
            </main>
          </div>
          {isMenuOpen && !setup.locked && <MobileDrawer onClose={closeMenu} />}
          {bottomNavRole && (
            <BottomNav role={bottomNavRole} onOpenMore={openMenu} isMoreOpen={isMenuOpen} locked={setup.locked} />
          )}
        </div>
      </CartProvider>
      </CreditsProvider>
    </NotificationsProvider>
  );
}

export default Layout;
