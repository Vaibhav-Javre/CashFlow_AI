import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  ReceiptText,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  Sliders,
  LineChart,
  FileSpreadsheet,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Globe,
  X
} from 'lucide-react';

export const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Cash Forecast', path: '/forecast', icon: TrendingUp },
  { name: 'Transactions', path: '/transactions', icon: ReceiptText },
  { name: 'Receivables', path: '/receivables', icon: ArrowDownLeft },
  { name: 'Payables', path: '/payables', icon: ArrowUpRight },
  { name: 'AI Risk Center', path: '/risks', icon: ShieldAlert, badge: 'Alert' },
  { name: 'Recommendations', path: '/recommendations', icon: Sparkles },
  { name: 'What-If Simulator', path: '/simulator', icon: Sliders },
  { name: 'Business Insights', path: '/insights', icon: LineChart },
  { name: 'Data Import', path: '/imports', icon: FileSpreadsheet },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings }
];

export default function Sidebar({
  businessName = 'Apex Precision Dynamics',
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-2xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white border-r border-stone-200 flex flex-col transition-all duration-200 ease-out select-none shadow-2xs ${
          isMobileOpen
            ? 'translate-x-0 w-64'
            : '-translate-x-full lg:translate-x-0 ' + (isCollapsed ? 'lg:w-16' : 'lg:w-64')
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* Professional Logo Mark */}
            <div className="w-9 h-9 rounded-lg bg-stone-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 16L9.5 10.5L14 15L20 8" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 8H20V13" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {(!isCollapsed || isMobileOpen) && (
              <div className="truncate">
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-sm tracking-tight text-stone-900">CashFlow</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/80">AI</span>
                </div>
                <span className="text-[10px] text-stone-600 block -mt-0.5 font-medium">MSME Finance</span>
              </div>
            )}
          </div>

          {/* Close button for Mobile Drawer */}
          {isMobileOpen && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-md hover:bg-stone-100 lg:hidden cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Business Context Chip (Expanded mode only) */}
        {(!isCollapsed || isMobileOpen) && (
          <div className="px-3 pt-3">
            <div className="px-3 py-2 rounded-lg bg-[#faf8f5] border border-stone-200/70 flex items-center justify-between">
              <div className="truncate">
                <span className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block">Enterprise</span>
                <p className="text-xs font-bold text-stone-900 truncate">{businessName}</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" title="Active" />
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                }}
                title={isCollapsed && !isMobileOpen ? item.name : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded-lg text-xs transition-colors duration-150 group cursor-pointer ${
                    isCollapsed && !isMobileOpen ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                  } ${
                    isActive
                      ? 'bg-emerald-50/80 text-emerald-800 font-semibold border border-emerald-200/70 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70 font-medium'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                  {(!isCollapsed || isMobileOpen) && <span>{item.name}</span>}
                </div>

                {(!isCollapsed || isMobileOpen) && item.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Desktop Collapse Toggle Footer */}
        <div className="hidden lg:flex p-3 border-t border-stone-100 bg-white items-center justify-between">
          {(!isCollapsed) && (
            <span className="text-[11px] text-stone-600 font-medium">Collapse Menu</span>
          )}
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors cursor-pointer ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
