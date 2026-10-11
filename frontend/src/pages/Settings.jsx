import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building2, ShieldCheck, Bell, Save, Check } from 'lucide-react';
import Button from '../components/common/Button';
import { api } from '../api/client';

export default function Settings({ onRefreshApp }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Read current active user session for initial fallback
  const getInitialUser = () => {
    try {
      const stored = localStorage.getItem('cashflow_user');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  };
  const activeUser = getInitialUser();

  const [formData, setFormData] = useState({
    businessName: activeUser?.business_name || 'My Business',
    industry: activeUser?.industry || 'General MSME Business',
    currency: 'INR (₹)',
    openingBalance: String(activeUser?.current_balance || '500000'),
    targetReserve: String(activeUser?.target_reserve || '100000'),
    runwayAlertDays: '30',
    earlyDiscountPct: '2.0',
    emailAlerts: true,
    weeklyDigest: true
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        let currentBiz = null;
        try {
          const bizRes = await api.getCurrentBusiness();
          if (bizRes && bizRes.data) {
            currentBiz = bizRes.data;
          }
        } catch (e) {
          currentBiz = getInitialUser();
        }

        const res = await api.getForecastSettings().catch(() => ({}));
        const fData = res?.data || {};

        setFormData(prev => ({
          ...prev,
          businessName: currentBiz?.name || currentBiz?.business_name || prev.businessName,
          industry: currentBiz?.industry || prev.industry,
          currency: currentBiz?.currency ? `INR (${currentBiz.currency})` : prev.currency,
          openingBalance: String(fData.opening_balance ?? currentBiz?.current_balance ?? prev.openingBalance),
          targetReserve: String(fData.minimum_cash_buffer ?? currentBiz?.target_reserve ?? prev.targetReserve)
        }));
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const openBal = parseFloat(formData.openingBalance) || 0;
      const targetRes = parseFloat(formData.targetReserve) || 0;

      // 1. Update business profile in backend
      const res = await api.updateBusinessProfile({
        business_name: formData.businessName.trim(),
        industry: formData.industry.trim(),
        currency: '₹',
        opening_balance: openBal,
        target_reserve: targetRes
      });

      // 2. Also keep forecast settings in sync
      await api.updateForecastSettings({
        opening_balance: openBal,
        minimum_cash_buffer: targetRes,
        notes: `Updated from Settings page for ${formData.businessName}`
      }).catch(() => null);

      // 3. Update localStorage so Navbar and Sidebar reflect changes immediately
      try {
        const stored = JSON.parse(localStorage.getItem('cashflow_user') || '{}');
        const updated = {
          ...stored,
          ...(res?.user || {}),
          business_name: formData.businessName.trim(),
          industry: formData.industry.trim(),
          current_balance: openBal,
          target_reserve: targetRes
        };
        localStorage.setItem('cashflow_user', JSON.stringify(updated));
      } catch (err) {}

      setSaved(true);
      if (onRefreshApp) onRefreshApp();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert("Error saving settings: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fade-fast">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-stone-700" /> Organization & Model Settings
        </h1>
        <p className="text-xs text-stone-600 mt-0.5">
          Configure minimum liquidity buffers, currency standards, and risk alert rules
        </p>
      </div>

      {saved && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-fast">
          <Check className="w-4 h-4 text-emerald-600" />
          Settings updated successfully. Buffer calculations updated across all models.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Organization Information */}
        <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
          <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">Organization Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">Company Name</label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">Sector / Industry</label>
              <input
                type="text"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">Reporting Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                <option value="INR (₹)">Indian Rupee (INR - ₹)</option>
                <option value="USD ($)">US Dollar (USD - $)</option>
                <option value="EUR (€)">Euro (EUR - €)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Liquidity Buffer Policies */}
        <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
          <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">Liquidity & Reserve Buffer Rules</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">Minimum Safe Reserve Buffer (₹)</label>
              <input
                type="number"
                value={formData.targetReserve}
                onChange={(e) => setFormData({ ...formData, targetReserve: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-lg text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
              <span className="text-[11px] text-stone-400 mt-1 block">
                Triggers Early Warning alerts when projected cash falls below this line.
              </span>
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">Runway Alert Horizon (Days)</label>
              <input
                type="number"
                value={formData.runwayAlertDays}
                onChange={(e) => setFormData({ ...formData, runwayAlertDays: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-lg text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
              <span className="text-[11px] text-stone-400 mt-1 block">
                Flag vulnerability if estimated runway falls below this duration.
              </span>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
          <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">Alert Triggers</h3>
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.emailAlerts}
                onChange={(e) => setFormData({ ...formData, emailAlerts: e.target.checked })}
                className="rounded accent-emerald-600"
              />
              <span className="text-stone-700">Send immediate alert when critical liquidity deficit is projected within 14 days</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.weeklyDigest}
                onChange={(e) => setFormData({ ...formData, weeklyDigest: e.target.checked })}
                className="rounded accent-emerald-600"
              />
              <span className="text-stone-700">Weekly MSME cash position audit report</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" variant="primary" icon={Save} className="bg-stone-900 hover:bg-stone-800 text-white">
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  );
}
