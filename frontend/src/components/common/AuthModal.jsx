import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import Button from './Button';
import { api } from '../../api/client';

const INDUSTRIES = [
  'Precision Tooling & MSME Engineering',
  'Automotive & Spare Parts',
  'Textile & Garment Manufacturing',
  'Wholesale & Distribution',
  'Retail & Supermarkets',
  'IT, SaaS & Digital Services',
  'Logistics, Transport & Supply Chain',
  'Construction & Building Materials',
  'Food Processing & FMCG',
  'Healthcare & Pharmaceuticals',
  'Other MSME Business'
];

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'login', // 'login' or 'register'
  onAuthSuccess
}) {
  const [mode, setMode] = useState(initialMode); // 'login' or 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Login form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    remember: true
  });

  // Register form state
  const [regForm, setRegForm] = useState({
    business_name: '',
    owner_name: '',
    email: '',
    password: '',
    industry: 'Precision Tooling & MSME Engineering',
    currency: '₹',
    opening_balance: '500000',
    target_reserve: '200000'
  });

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login({
        email: loginForm.email,
        password: loginForm.password
      });

      if (res.success && res.user) {
        setSuccessMsg(res.message || 'Login successful!');
        localStorage.setItem('cashflow_user', JSON.stringify(res.user));
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.user);
          onClose();
        }, 800);
      } else {
        throw new Error(res.error || 'Failed to authenticate.');
      }
    } catch (err) {
      setError(err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await api.switchDemoBusiness();
      const demoUser = {
        email: 'demo@apexprecision.com',
        owner_name: 'Rajesh Sharma',
        business_name: 'Apex Precision Dynamics',
        industry: 'Precision Tooling & MSME Engineering',
        currency: '₹'
      };
      localStorage.setItem('cashflow_user', JSON.stringify(demoUser));
      setSuccessMsg('Loaded Apex Precision Dynamics demo workspace!');
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(demoUser);
        onClose();
      }, 700);
    } catch (err) {
      setError('Failed to switch to demo workspace: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!regForm.business_name.trim()) {
      setError('Please enter your business name.');
      return;
    }
    if (!regForm.email.trim()) {
      setError('Please enter your business email.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        business_name: regForm.business_name.trim(),
        owner_name: regForm.owner_name.trim() || regForm.business_name.trim(),
        email: regForm.email.trim(),
        password: regForm.password,
        industry: regForm.industry,
        currency: regForm.currency,
        opening_balance: parseFloat(regForm.opening_balance) || 500000,
        target_reserve: parseFloat(regForm.target_reserve) || 200000
      };

      const res = await api.register(payload);

      if (res.success && res.user) {
        setSuccessMsg(res.message || 'Business registered successfully!');
        localStorage.setItem('cashflow_user', JSON.stringify(res.user));
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.user);
          onClose();
        }, 900);
      } else {
        throw new Error(res.error || 'Failed to register business.');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please check the fields.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm overflow-y-auto animate-fade-fast">
      <div className="w-full max-w-lg bg-white border border-stone-200 rounded-3xl shadow-2xl overflow-hidden p-6 my-6 max-h-[92vh] overflow-y-auto animate-pop-fast">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                {mode === 'login' ? 'Sign In to CashFlow AI' : 'Register Your Business'}
              </h3>
              <p className="text-xs text-stone-500">
                {mode === 'login'
                  ? 'Access your predictive cash flow command center'
                  : 'Start protecting your working capital and runway today'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-xl mt-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Register Business
          </button>
        </div>

        {/* Alerts */}
        {successMsg && (
          <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-fade-fast">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2 animate-fade-fast">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ================= MODE: SIGN IN ================= */}
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3.5 text-xs">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Business Email or Username
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="name@business.com or demo"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-stone-700 font-semibold">
                  Password
                </label>
                <span className="text-[11px] text-stone-400">
                  (Any password for demo)
                </span>
              </div>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-stone-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={loginForm.remember}
                  onChange={(e) => setLoginForm({ ...loginForm, remember: e.target.checked })}
                  className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Remember this device</span>
              </label>
              <span className="text-emerald-700 hover:underline cursor-pointer">
                Forgot password?
              </span>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                variant="primary"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                {loading ? 'Signing in...' : 'Sign In to Workspace'}
              </Button>

              {/* Instant 1-Click Demo Launcher */}
              <button
                type="button"
                onClick={handleQuickDemo}
                disabled={loading}
                className="w-full py-2.5 rounded-xl border border-stone-300 hover:border-emerald-500 bg-stone-50 hover:bg-emerald-50/50 text-stone-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>1-Click Launch Demo (Apex Precision)</span>
              </button>
            </div>
          </form>
        ) : (
          /* ================= MODE: REGISTER ================= */
          <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-3 text-xs">
            {/* Business Name */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Business / Enterprise Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Precision, Sharma CNC Works"
                  value={regForm.business_name}
                  onChange={(e) => setRegForm({ ...regForm, business_name: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            {/* Industry */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Industry / MSME Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={regForm.industry}
                onChange={(e) => setRegForm({ ...regForm, industry: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            {/* Owner Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Owner / Promoter Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rajesh Sharma"
                    value={regForm.owner_name}
                    onChange={(e) => setRegForm({ ...regForm, owner_name: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Business Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="owner@company.com"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Account Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="Create a password (min 6 characters)"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white font-mono"
                />
              </div>
            </div>

            {/* Financial Calibration: Opening Balance & Target Reserve */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Initial Cash Balance (₹)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={regForm.opening_balance}
                  onChange={(e) => setRegForm({ ...regForm, opening_balance: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Safe Cash Buffer (₹)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={regForm.target_reserve}
                  onChange={(e) => setRegForm({ ...regForm, target_reserve: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                {loading ? 'Creating Workspace...' : 'Create Business Workspace & Launch'}
              </Button>
            </div>
          </form>
        )}

        {/* Security badge footer */}
        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>256-Bit Encrypted MSME Financial Data Isolation</span>
        </div>
      </div>
    </div>
  );
}
