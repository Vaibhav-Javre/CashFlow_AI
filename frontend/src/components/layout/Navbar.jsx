import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  Check,
  ChevronDown,
  Building2,
  Settings,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import Button from '../common/Button';

// Page title mapper based on pathname
const PAGE_TITLES = {
  '/': 'Home',
  '/dashboard': 'Financial Command Center',
  '/forecast': 'Cash Forecast',
  '/transactions': 'Transactions',
  '/receivables': 'Receivables',
  '/payables': 'Payables',
  '/risks': 'AI Risk Center',
  '/recommendations': 'Recommendations',
  '/simulator': 'What-If Simulator',
  '/insights': 'Business Insights',
  '/imports': 'Data Import',
  '/reports': 'Reports',
  '/settings': 'Settings'
};

export default function Navbar({
  businessName,
  isApiHealthy = true,
  onRefresh,
  isRefreshing = false,
  onQuickAction,
  onOpenMobile,
  isCollapsed = false
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTitle = PAGE_TITLES[location.pathname] || 'Financial Overview';

  // Read stored user business name
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('cashflow_user') || '{}');
    } catch {
      return {};
    }
  })();
  const effectiveBusinessName = storedUser.business_name || businessName || 'My Business';

  // State for popovers
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={`h-16 bg-white/95 backdrop-blur-md border-b border-stone-200 fixed top-0 right-0 z-30 px-4 sm:px-6 flex items-center justify-between transition-all duration-200 ease-out ${
        isCollapsed ? 'left-0 lg:left-16' : 'left-0 lg:left-64'
      }`}
    >
      {/* Left Section: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          onClick={onOpenMobile}
          className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg lg:hidden cursor-pointer"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Page Title */}
        <div>
          <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
            {currentTitle}
          </h1>
        </div>
      </div>

      {/* Right Section: Compact Search, Actions, Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Compact Search Field */}
        <div className="relative hidden md:block w-48 lg:w-60">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search records..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-[#fbfaf8] border border-stone-200 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
          />
        </div>

        {/* Quick Data Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh Financial Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
        </button>

        {/* Record Transaction Quick Action */}
        {onQuickAction && (
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={onQuickAction}
            className="hidden sm:inline-flex bg-stone-900 hover:bg-stone-800 text-white"
          >
            Record Entry
          </Button>
        )}

        {/* Notification Bell Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setHasUnread(false);
            }}
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors relative cursor-pointer"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            {hasUnread && (
              <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5 ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-stone-200 rounded-xl shadow-lg p-3 text-xs z-50 animate-pop-fast">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100 font-semibold text-stone-900">
                <span>Alerts & Notifications</span>
                <span className="text-[10px] text-stone-400 font-normal">Updated just now</span>
              </div>
              <div className="py-2 space-y-2">
                <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-amber-900">
                  <div className="font-semibold flex items-center gap-1.5 text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Minimum Buffer Alert
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Projected balance dips near ₹5,00,000 threshold on Day 11 due to payroll.
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/70 text-stone-700">
                  <div className="font-semibold text-[11px]">OmniTech Invoices Pending</div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    ₹2,68,000 receivables overdue by 18 days. Early discount recommended.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowNotifications(false);
                  navigate('/risks');
                }}
                className="w-full text-center py-1.5 text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold border-t border-stone-100 cursor-pointer"
              >
                Go to AI Risk Center &rarr;
              </button>
            </div>
          )}
        </div>

        {/* Business Profile Menu */}
        <div className="relative pl-1 sm:pl-2 border-l border-stone-200" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer text-left"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center border border-emerald-800 shadow-2xs">
              {(effectiveBusinessName || 'CF').slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden md:block">
              <div className="text-xs font-bold text-stone-900 leading-tight truncate max-w-[140px]">{effectiveBusinessName}</div>
              <div className="text-[10px] text-stone-500 leading-none">MSME Workspace</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-stone-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-white border border-stone-200 rounded-xl shadow-lg p-2 text-xs z-50 animate-pop-fast">
              <div className="px-3 py-2 border-b border-stone-100">
                <p className="font-bold text-stone-900 truncate">{effectiveBusinessName}</p>
                <p className="text-[11px] text-emerald-700 font-medium">Active Business Account</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-stone-700 hover:bg-stone-50 rounded-lg text-left cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400" /> Website & Home Page
                </button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-stone-700 hover:bg-stone-50 rounded-lg text-left cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-stone-400" /> Organization Settings
                </button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/insights');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-stone-700 hover:bg-stone-50 rounded-lg text-left cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5 text-stone-400" /> Business Profile
                </button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-lg text-left cursor-pointer font-medium"
                >
                  Switch Business / Sign In
                </button>
              </div>
              <div className="pt-1 border-t border-stone-100 text-[10px] text-stone-400 px-3 py-1.5 flex justify-between">
                <span>Currency: INR (₹)</span>
                <span className="text-emerald-600 font-semibold">Live Mode</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
