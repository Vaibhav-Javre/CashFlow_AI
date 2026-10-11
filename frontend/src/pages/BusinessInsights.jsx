import React, { useState, useEffect } from 'react';
import { LineChart, BarChart3, TrendingUp, DollarSign, Calendar, Layers } from 'lucide-react';
import SpendingBreakdownChart from '../components/charts/SpendingBreakdownChart';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { api } from '../api/client';
import { formatINR } from '../utils/formatters';

export default function BusinessInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await api.getDashboardSummary();
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Generating business intelligence metrics..." />;
  }

  const summary = data?.summary || {};
  const spending = data?.spending_breakdown || [];

  return (
    <div className="space-y-6 animate-fade-fast">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
          <LineChart className="w-6 h-6 text-emerald-700" /> Business Insights & Unit Economics
        </h1>
        <p className="text-xs text-stone-600 mt-0.5">
          Comprehensive operational burn, working capital turnover, and expense concentration analysis
        </p>
      </div>

      {/* Key Insight Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider block">
            Average Daily Burn
          </span>
          <h3 className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {formatINR(summary.daily_burn !== undefined ? summary.daily_burn : 0)}/day
          </h3>
          <p className="text-xs text-stone-500 mt-1">Based on trailing 30-day operating outflows</p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider block">
            Working Capital Cycle
          </span>
          <h3 className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {summary.working_capital_days !== undefined ? `${summary.working_capital_days} Days` : '30 Days'}
          </h3>
          <p className="text-xs text-stone-500 mt-1">DSO (Days Sales Outstanding) benchmark</p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider block">
            Net Monthly Cash Generation
          </span>
          <h3 className={`text-2xl font-bold mt-1 font-mono ${
            (summary.net_cashflow_30d || 0) >= 0 ? 'text-emerald-700' : 'text-stone-900'
          }`}>
            {formatINR(summary.net_cashflow_30d !== undefined ? summary.net_cashflow_30d : 0, { sign: true })}
          </h3>
          <p className="text-xs text-stone-500 mt-1">Net operational margin after vendor dues</p>
        </div>
      </div>

      {/* Expense Allocation Deep-Dive */}
      <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Expense Allocation Breakdown</h3>
            <p className="text-xs text-stone-500">Distribution of operating and capital disbursements</p>
          </div>
          <span className="text-xs font-semibold text-stone-600">Trailing 30 Days</span>
        </div>

        <SpendingBreakdownChart data={spending} />
      </div>
    </div>
  );
}
