import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getAccountSetup } from '../utils/accountSetup.js';
import Header from './Header.js';
import Sidebar from './Sidebar.js';
import AccountSetupGate from './AccountSetupGate.js';
import AnnouncementBanner from './AnnouncementBanner.js';
import { NotificationsProvider } from '../context/NotificationsContext.js';

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
      <div className="flex flex-col h-screen">
        <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} locked={setup.locked} />
        <div className="flex flex-row flex-1 overflow-hidden">
          <Sidebar isSidebarOpen={isSidebarOpen} locked={setup.locked} />
          <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {!setup.locked && <AnnouncementBanner />}
            <AccountSetupGate />
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

export default Layout;
