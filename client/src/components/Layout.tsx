import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  function onToggleSidebar() {
    setIsSidebarOpen(!isSidebarOpen);
  }

  return (
    <div className="flex flex-col h-screen">
      <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
      <div className="flex flex-row flex-1 overflow-hidden">
        <Sidebar isSidebarOpen={isSidebarOpen} />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;