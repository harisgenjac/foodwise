import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
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
    <NotificationsProvider>
      <div className="flex flex-col h-screen">
        <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
        <div className="flex flex-row flex-1 overflow-hidden">
          <Sidebar isSidebarOpen={isSidebarOpen} />
          <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

export default Layout;
