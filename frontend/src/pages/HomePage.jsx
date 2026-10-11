import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  ShieldAlert,
  Camera,
  Sliders,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Building2,
  Receipt,
  LineChart,
  BarChart3,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  Check,
  ChevronRight,
  ShieldCheck,
  Users,
  Clock,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import Button from '../components/common/Button';
import AuthModal from '../components/common/AuthModal';

export default function HomePage({ onSelectBusiness, activeBusinessName }) {
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  // Interactive Hero Simulator Widget state
  const [salesRevenue, setSalesRevenue] = useState(1800000); // ₹18,00,000
  const [delayDays, setDelayDays] = useState(25); // 25 days delay
  const [vendorExpenses, setVendorExpenses] = useState(1200000); // ₹12,00,000

  // Interactive Feature Tab state
  const [activeFeatureTab, setActiveFeatureTab] = useState('camera');

  // Dynamic calculations for Hero Simulator Widget
  const netSurplus = salesRevenue - vendorExpenses;
  const delayedImpact = Math.round((salesRevenue * (delayDays / 30)) * 0.45);
  const effectiveCashflow = netSurplus - delayedImpact;
  const runwayMonths = (effectiveCashflow > 0 ? (2800000 / (vendorExpenses || 1)).toFixed(1) : (1800000 / (vendorExpenses || 1)).toFixed(1));
  const healthScore = Math.max(25, Math.min(98, Math.round(75 + (netSurplus / 80000) - (delayDays * 0.8))));

  const handleOpenAuth = (mode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = (user) => {
    if (onSelectBusiness) {
      onSelectBusiness(user.business_name || 'Apex Precision Dynamics');
    }
    navigate('/dashboard');
  };

  const handleLaunchDemo = () => {
    if (onSelectBusiness) {
      onSelectBusiness('Apex Precision Dynamics');
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 font-sans selection:bg-emerald-500 selection:text-white">
      {/* ================= STICKY TOP NAVBAR ================= */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-emerald-500 text-white flex items-center justify-center font-black shadow-md shadow-emerald-700/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-stone-950 flex items-center gap-1.5">
                CashFlow <span className="text-emerald-700">AI</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  MSME
                </span>
              </span>
              <p className="text-[10px] text-stone-500 hidden sm:block">
                Predictive Cash Flow & Working Capital Intelligence
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-stone-600">
            <a href="#simulator" className="hover:text-emerald-700 transition-colors">
              Interactive Tool
            </a>
            <a href="#features" className="hover:text-emerald-700 transition-colors">
              AI Features
            </a>
            <a href="#camera-vision" className="hover:text-emerald-700 transition-colors">
              Gemini Vision
            </a>
            <a href="#how-it-works" className="hover:text-emerald-700 transition-colors">
              How It Works
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleLaunchDemo}
              className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-100 border border-stone-200 transition-all cursor-pointer"
            >
              Live Demo
            </button>

            <button
              onClick={() => handleOpenAuth('login')}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-800 hover:text-emerald-800 transition-colors cursor-pointer"
            >
              Sign In
            </button>

            <button
              onClick={() => handleOpenAuth('register')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm shadow-emerald-700/20 active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ================= HERO SECTION ================= */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-stone-200 bg-gradient-to-b from-[#faf9f6] via-[#f7f6f2] to-[#f4f2ec]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold shadow-2xs mb-6">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>Powered by Google Gemini 2.5 Flash Vision & Time-Series Engine</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-stone-950 tracking-tight leading-[1.12]">
              Predict Cash Shortfalls{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-700">
                90 Days Before
              </span>{' '}
              They Strike.
            </h1>

            {/* Subtitle */}
            <p className="mt-5 text-sm sm:text-base lg:text-lg text-stone-600 leading-relaxed max-w-2xl mx-auto">
              Built for micro, small, and medium businesses. Auto-extract paper bills with camera OCR,
              detect customer delay bottlenecks, and simulate prescriptive financial decisions before making payroll.
            </p>

            {/* Hero Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <button
                onClick={() => handleOpenAuth('register')}
                className="px-6 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold shadow-lg shadow-emerald-700/25 active:scale-98 transition-all cursor-pointer flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                <span>Register Business Free</span>
              </button>

              <button
                onClick={handleLaunchDemo}
                className="px-6 py-3 rounded-2xl bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 text-sm font-bold shadow-xs active:scale-98 transition-all cursor-pointer flex items-center gap-2"
              >
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>Open Interactive Workspace</span>
              </button>
            </div>

            {/* Value bullets */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-stone-500 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> No Expensive ERP Setup
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Camera & Document OCR
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 100% Confidential & Secure
              </span>
            </div>
          </div>

          {/* ================= HERO INTERACTIVE SIMULATOR CARD ================= */}
          <div id="simulator" className="mt-14 max-w-4xl mx-auto bg-white border border-stone-200/90 rounded-3xl shadow-xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-stone-100 gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Interactive Working Capital Sandbox
                </span>
                <h3 className="text-lg font-bold text-stone-900">
                  Test Your Business Cash Resilience
                </h3>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 self-start sm:self-auto">
                <Sliders className="w-3.5 h-3.5 text-emerald-600" /> Live Simulation
              </span>
            </div>

            {/* Interactive Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6 text-xs">
              {/* Slider 1: Revenue */}
              <div className="space-y-2">
                <div className="flex justify-between font-semibold">
                  <span className="text-stone-600">Monthly Inflow:</span>
                  <span className="text-emerald-700 font-mono font-bold">
                    ₹{(salesRevenue / 100000).toFixed(1)} Lakhs
                  </span>
                </div>
                <input
                  type="range"
                  min="500000"
                  max="4000000"
                  step="100000"
                  value={salesRevenue}
                  onChange={(e) => setSalesRevenue(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] text-stone-400">Total customer collections</span>
              </div>

              {/* Slider 2: Delay Days */}
              <div className="space-y-2">
                <div className="flex justify-between font-semibold">
                  <span className="text-stone-600">Debtor Delay:</span>
                  <span className={`font-mono font-bold ${delayDays > 30 ? 'text-rose-600' : 'text-amber-600'}`}>
                    +{delayDays} Days
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <span className="text-[10px] text-stone-400">Average customer payment lag</span>
              </div>

              {/* Slider 3: Vendor Commitments */}
              <div className="space-y-2">
                <div className="flex justify-between font-semibold">
                  <span className="text-stone-600">Fixed Expenses:</span>
                  <span className="text-rose-700 font-mono font-bold">
                    ₹{(vendorExpenses / 100000).toFixed(1)} Lakhs
                  </span>
                </div>
                <input
                  type="range"
                  min="300000"
                  max="3000000"
                  step="100000"
                  value={vendorExpenses}
                  onChange={(e) => setVendorExpenses(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <span className="text-[10px] text-stone-400">Raw materials, rent, payroll</span>
              </div>
            </div>

            {/* Dynamic Calculated Results Bar */}
            <div className="p-4 sm:p-5 rounded-2xl bg-stone-900 text-white grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
              <div>
                <span className="text-[10px] text-stone-400 block font-medium">Projected Runway</span>
                <span className={`text-base sm:text-lg font-bold font-mono ${Number(runwayMonths) < 1.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {runwayMonths} Months
                </span>
              </div>

              <div>
                <span className="text-[10px] text-stone-400 block font-medium">Delayed Cash Tied Up</span>
                <span className="text-base sm:text-lg font-bold font-mono text-amber-400">
                  ₹{(delayedImpact / 1000).toFixed(0)}k
                </span>
              </div>

              <div>
                <span className="text-[10px] text-stone-400 block font-medium">MSME Health Score</span>
                <span className="text-base sm:text-lg font-bold font-mono text-white">
                  {healthScore} / 100
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <button
                  onClick={handleLaunchDemo}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>See Full Forecast</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Prescriptive Recommendation Note */}
            <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 text-xs text-emerald-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>AI Prescriptive Insight:</strong>{' '}
                {delayDays > 30
                  ? `Late customer payments are creating a ₹${(delayedImpact / 1000).toFixed(0)}k liquidity trap. Offer a 2% early settlement discount to accelerate ₹${(salesRevenue * 0.35 / 1000).toFixed(0)}k by 14 days.`
                  : `Your working capital buffer is resilient. You have adequate runway to support supplier payment cycles without shortfalls.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CORE CAPABILITIES SHOWCASE ================= */}
      <section id="features" className="py-20 bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Complete Financial Control
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-stone-900 tracking-tight mt-1">
              Engineered Specifically For Growing Businesses
            </h2>
            <p className="mt-3 text-sm text-stone-500">
              Unlike generic accounting tools that tell you what happened yesterday, CashFlow AI reveals what happens over the next 90 days.
            </p>
          </div>

          {/* Interactive Feature Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10 text-xs font-semibold">
            <button
              onClick={() => setActiveFeatureTab('camera')}
              className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'camera'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>Camera & Receipt AI</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('forecast')}
              className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'forecast'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>90-Day Predictive Engine</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('risks')}
              className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'risks'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>AI Risk Radar</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('simulator')}
              className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'simulator'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>What-If Policy Engine</span>
            </button>
          </div>

          {/* Tab Content Display */}
          <div className="bg-[#fbfaf8] border border-stone-200 rounded-3xl p-6 sm:p-10 max-w-5xl mx-auto shadow-sm">
            {activeFeatureTab === 'camera' && (
              <div id="camera-vision" className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center animate-fade-fast">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Gemini 2.5 Flash Vision
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
                    Turn Invoices & Paper Bills Into Structured Records in Seconds
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Simply take a photo with your device camera or upload an image. The AI automatically identifies the vendor, total INR amount, invoice number, due date, and category.
                  </p>

                  <ul className="mt-5 space-y-2.5 text-xs text-stone-700 font-medium">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Live in-browser camera viewfinder with alignment guide
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Auto-populates Title, Amount, Dates, and Categories
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Review & confirm flow ensures 100% human verification
                    </li>
                  </ul>

                  <button
                    onClick={handleLaunchDemo}
                    className="mt-6 px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>Test Camera Scanner in Demo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Visual Card Mockup */}
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-md">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-stone-800">Scanned Bill Preview</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      96% Match
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex justify-between">
                      <span className="text-stone-500">Extracted Title:</span>
                      <span className="font-semibold text-stone-900">Supplier Bill - Steel Fasteners</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex justify-between">
                      <span className="text-stone-500">Amount:</span>
                      <span className="font-bold text-emerald-700 font-mono">₹84,500.00</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex justify-between">
                      <span className="text-stone-500">Category:</span>
                      <span className="font-semibold text-stone-900">Inventory Purchase</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex justify-between">
                      <span className="text-stone-500">Invoice Reference:</span>
                      <span className="font-mono text-stone-800">INV-2026-904</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'forecast' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center animate-fade-fast">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Time-Series Intelligence
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
                    Dynamic Cash Timeline with Confidence Intervals
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Combines committed invoice dues, historical collections variance, recurring payroll, and safe reserve buffer thresholds.
                  </p>
                  <ul className="mt-5 space-y-2.5 text-xs text-stone-700 font-medium">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      30, 60, and 90-day predictive projections
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Automated Safe Buffer breach alerts
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Optimistic vs conservative confidence bands
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-md">
                  <div className="h-44 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-xs font-bold text-stone-800">
                      <span>30-Day Liquidity Curve</span>
                      <span className="text-emerald-700">Healthy Buffer</span>
                    </div>
                    <div className="relative h-28 border-b border-l border-stone-300 flex items-end px-2 pb-1 gap-2">
                      <div className="w-1/6 bg-emerald-500/80 rounded-t h-80%"></div>
                      <div className="w-1/6 bg-emerald-500/80 rounded-t h-70%"></div>
                      <div className="w-1/6 bg-amber-500/80 rounded-t h-45%"></div>
                      <div className="w-1/6 bg-emerald-500/80 rounded-t h-60%"></div>
                      <div className="w-1/6 bg-emerald-500/80 rounded-t h-75%"></div>
                      <div className="w-1/6 bg-emerald-500/80 rounded-t h-90%"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>Day 1</span>
                      <span>Day 15 (Payroll)</span>
                      <span>Day 30</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'risks' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center animate-fade-fast">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-3">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Early-Warning Monitor
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
                    Debtor Concentration & Clustered Maturity Alerts
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Identifies customers responsible for disproportionate receivables risk, and warns you before clustered vendor cheques bounce.
                  </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-md space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                    <div className="font-bold text-amber-900">High Debtor Concentration (41%)</div>
                    <p className="text-amber-800 text-[11px] mt-0.5">Top 2 clients represent ₹2.68L out of ₹6.5L total receivables.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs">
                    <div className="font-bold text-rose-900">Clustered Vendor Payments</div>
                    <p className="text-rose-800 text-[11px] mt-0.5">₹1.45L commitments maturing on Day 18 concurrent with GST payout.</p>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'simulator' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center animate-fade-fast">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 mb-3">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" /> What-If Sandbox
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
                    Simulate Business Decisions Before Making Them
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Test the impact of delaying non-critical vendor bills, offering 2% prompt-payment discounts, or surviving a 20% sales downturn.
                  </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-md text-xs">
                  <p className="font-bold text-stone-900 mb-2">Simulated Policy Adjustments:</p>
                  <div className="space-y-2">
                    <div className="flex justify-between p-2 rounded bg-stone-50 border">
                      <span>Early Customer Discount (2%)</span>
                      <span className="text-emerald-700 font-bold">+₹1,42,000 Inflow</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-stone-50 border">
                      <span>Defer Equipment Purchase</span>
                      <span className="text-emerald-700 font-bold">+₹75,000 Buffer</span>
                    </div>
                    <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                      Net Liquidity Gain: +₹2,17,000 (Runway +24 Days)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS (3 SIMPLE STEPS) ================= */}
      <section id="how-it-works" className="py-20 bg-[#faf9f6] border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Zero Learning Curve
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-stone-900 tracking-tight mt-1">
              How CashFlow AI Protects Your Business
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center mb-4">
                01
              </div>
              <h3 className="text-base font-bold text-stone-900">Capture & Ingest</h3>
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">
                Snap paper bills using camera OCR, upload invoices, or import bank statements. All transactions are categorized automatically.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center mb-4">
                02
              </div>
              <h3 className="text-base font-bold text-stone-900">AI Analyzes & Forecasts</h3>
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">
                Our predictive financial model projects daily balances for 30/60/90 days, flagging dips below your minimum safety reserve.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center mb-4">
                03
              </div>
              <h3 className="text-base font-bold text-stone-900">Simulate & Protect</h3>
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">
                Receive prescriptive AI recommendations to recover receivables faster, postpone non-urgent bills, and keep payroll protected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA BANNER ================= */}
      <section className="py-20 bg-stone-900 text-white relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Take Control of Your Working Capital
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-2 text-white">
            Register Your Business in Under 60 Seconds
          </h2>
          <p className="mt-4 text-sm sm:text-base text-stone-400 max-w-xl mx-auto">
            Join MSME founders who sleep better at night knowing their cash flow is predicted and protected.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={() => handleOpenAuth('register')}
              className="px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 active:scale-98 transition-all cursor-pointer flex items-center gap-2"
            >
              <Building2 className="w-4 h-4" />
              <span>Create Free Business Workspace</span>
            </button>

            <button
              onClick={handleLaunchDemo}
              className="px-6 py-3.5 rounded-2xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-sm font-bold active:scale-98 transition-all cursor-pointer"
            >
              Explore Demo Account
            </button>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-stone-950 text-stone-400 py-12 border-t border-stone-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              CF
            </div>
            <span className="font-bold text-stone-200">CashFlow AI</span>
            <span className="text-stone-600">|</span>
            <span className="text-stone-500">Working Capital Intelligence for MSMEs</span>
          </div>

          <div className="flex items-center gap-4 text-stone-400">
            <button onClick={() => handleOpenAuth('login')} className="hover:text-white cursor-pointer">
              Sign In
            </button>
            <button onClick={() => handleOpenAuth('register')} className="hover:text-white cursor-pointer">
              Register Business
            </button>
            <button onClick={handleLaunchDemo} className="hover:text-white cursor-pointer">
              Demo Workspace
            </button>
          </div>
        </div>
      </footer>

      {/* Auth Modal for Sign In & Register */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
