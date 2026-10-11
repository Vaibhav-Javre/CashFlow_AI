import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout({
  children,
  businessName,
  isApiHealthy,
  onRefresh,
  isRefreshing,
  onQuickAction
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-800 flex flex-col">
      {/* Sidebar Navigation */}
      <Sidebar
        businessName={businessName}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main App Container */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ease-out ${
          isCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        }`}
      >
        <Navbar
          businessName={businessName}
          isApiHealthy={isApiHealthy}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onQuickAction={onQuickAction}
          onOpenMobile={() => setIsMobileOpen(true)}
          isCollapsed={isCollapsed}
        />

        <main className="flex-1 mt-16 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
