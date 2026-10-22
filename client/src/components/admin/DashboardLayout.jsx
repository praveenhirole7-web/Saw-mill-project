import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Breadcrumbs from './Breadcrumbs';
import './DashboardLayout.css';

export default function DashboardLayout({ children }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const handleOpenMobileSidebar = () => {
    setIsMobileSidebarOpen(true);
  };

  const handleCloseMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  return (
    <div className="admin-layout">
      {/* Sidebar Navigation (Collapsible & Mobile Responsive) */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={handleCloseMobileSidebar}
      />

      {/* Main Administrative Container */}
      <div className="admin-layout__main">
        {/* Topbar Header */}
        <Topbar onOpenMobileSidebar={handleOpenMobileSidebar} />

        {/* Dynamic Page Content */}
        <main className="admin-layout__content" id="admin-main-content">
          <div className="admin-layout__container">
            <Breadcrumbs />
            {children || <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
