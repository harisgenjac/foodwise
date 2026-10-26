import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getAccountSetup } from '../utils/accountSetup.js';
import Header from './Header.js';
import Sidebar from './Sidebar.js';
import AccountSetupGate from './AccountSetupGate.js';
import AnnouncementBanner from './AnnouncementBanner.js';
import Footer from './Footer.js';
import { NotificationsProvider } from '../context/NotificationsContext.js';
import { CreditsProvider } from '../context/CreditsContext.js';
import CreditBanner from './credits/CreditBanner.js';

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
  const { user } = useAuth();
  const setup = getAccountSetup(user);
  const isBusiness = user?.role === 'STORE' || user?.role === 'RESTAURANT';

  function onToggleSidebar() {
    const next = !isSidebarOpen;
    setIsSidebarOpen(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // storage unavailable: the state still works for this session
    }
  }

  return (
    // A temporary password blocks every other API call, so notifications wait until it is replaced.
    <NotificationsProvider enabled={!setup.needsPassword}>
      {/* Credits only exist for stores and restaurants, and only once the account is set up. */}
      <CreditsProvider enabled={isBusiness && !setup.locked}>
        <div className="flex flex-col h-screen">
          <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} locked={setup.locked} />
          <div className="flex flex-row flex-1 overflow-hidden">
            <Sidebar isSidebarOpen={isSidebarOpen} locked={setup.locked} />
            {/* A flex column, so the footer sits at the bottom of short pages and after the content of long ones. */}
            <main className="flex flex-1 flex-col overflow-y-auto p-6 bg-gray-50">
              <div className="flex-1 pb-6">
                {!setup.locked && <AnnouncementBanner />}
                {!setup.locked && <CreditBanner />}
                <AccountSetupGate />
                <Outlet />
              </div>
              <Footer showImpact={!setup.needsPassword} />
            </main>
          </div>
        </div>
      </CreditsProvider>
    </NotificationsProvider>
  );
}

export default Layout;
