import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Wallet,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Settings,
  Calendar,
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Table as TableIcon,
  Layers,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import LoadingSpinner from '../components/common/LoadingSpinner';
import MetricCard from '../components/common/MetricCard';
import Button from '../components/common/Button';
import CashFlowTrendChart from '../components/charts/CashFlowTrendChart';
import { api } from '../api/client';
import { formatINR, formatDate } from '../utils/formatters';

export default function Forecast() {
  const [horizon, setHorizon] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View Mode: 'both' | 'chart' | 'table'
  const [viewMode, setViewMode] = useState('both');

  // Expanded ledger row for day details
  const [expandedDate, setExpandedDate] = useState(null);

  // Settings Configuration Form Modal
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configBalance, setConfigBalance] = useState('');
  const [configBuffer, setConfigBuffer] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState(false);

  // Fetch forecast data from backend engine
  const fetchForecast = async (days) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getForecast(days);
      if (res && res.data) {
        setData(res.data);
        if (res.data.settings) {
          setConfigBalance(res.data.settings.opening_balance?.toString() || '');
          setConfigBuffer(res.data.settings.minimum_cash_buffer?.toString() || '');
        }
      } else {
        throw new Error('Unexpected forecast response format');
      }
    } catch (err) {
      console.error('Failed to calculate forecast:', err);
      setError(err.message || 'Failed to calculate cash-flow forecast. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast(horizon);
  }, [horizon]);

  // Handle Settings Save
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setConfigError('');
    setConfigSuccess(false);

    const numBal = parseFloat(configBalance);
    const numBuf = parseFloat(configBuffer);

    if (isNaN(numBal)) {
      setConfigError('Please enter a valid starting cash balance.');
      return;
    }
    if (isNaN(numBuf) || numBuf < 0) {
      setConfigError('Please enter a valid non-negative minimum cash buffer.');
      return;
    }

    try {
      setConfigSaving(true);
      await api.updateForecastSettings({
        opening_balance: numBal,
        minimum_cash_buffer: numBuf
      });
      setConfigSuccess(true);
      setTimeout(() => {
        setIsConfigOpen(false);
        setConfigSuccess(false);
      }, 900);
      // Immediately recalculate forecast with new settings
      fetchForecast(horizon);
    } catch (err) {
      setConfigError(err.message || 'Failed to save forecast settings.');
    } finally {
      setConfigSaving(false);
    }
  };

  const summary = data?.summary || {};
  const settings = data?.settings || {};
  const timeline = data?.timeline || [];

  const lowestBal = summary.lowest_projected_balance ?? data?.lowest_projected_balance ?? 0;
  const endingCash = summary.projected_ending_cash ?? data?.projected_ending_cash ?? 0;
  const netMovement = summary.forecast_net_movement ?? data?.forecast_net_movement ?? 0;
  const firstRisk = summary.first_risk_date && summary.first_risk_date !== 'No risk detected'
    ? summary.first_risk_date
    : null;

  return (
    <div className="space-y-6 animate-fade-fast">
      {/* 1. Header with Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-700" /> Cash-Flow Forecast
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Show the business's projected cash position for the coming days.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {/* Period Selection: 7 Days, 30 Days, 60 Days */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shadow-2xs">
            {[7, 30, 60].map((days) => (
              <button
                key={days}
                onClick={() => setHorizon(days)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 ${
                  horizon === days
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {days} Days
              </button>
            ))}
          </div>

          {/* Quick Refresh */}
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => fetchForecast(horizon)}
            disabled={loading}
            title="Recalculate forecast"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. Compact Opening-Balance & Buffer Strip */}
      <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-100 flex-1">
            {/* Opening Cash Balance */}
            <div className="pr-4">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                Current Opening Cash Balance
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold font-mono text-stone-900">
                  {formatINR(settings.opening_balance ?? data?.starting_balance ?? 0)}
                </span>
                <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  User Starting
                </span>
              </div>
              <span className="text-[10px] text-stone-500 block mt-0.5">
                User-provided starting balance (not verified by bank)
              </span>
            </div>

            {/* Forecast Start Date */}
            <div className="sm:px-4 pt-2 sm:pt-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                Forecast Start Date
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                <span className="text-sm font-semibold font-mono text-stone-800">
                  {formatDate(settings.start_date || data?.start_date, { format: 'full' })}
                </span>
              </div>
              <span className="text-[10px] text-stone-500 block mt-0.5">
                Calculations project outward {horizon} days
              </span>
            </div>

            {/* Minimum Desired Cash Buffer */}
            <div className="sm:pl-4 pt-2 sm:pt-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                Minimum Desired Cash Buffer
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold font-mono text-amber-800">
                  {formatINR(settings.minimum_cash_buffer ?? data?.target_reserve ?? 0)}
                </span>
                <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Safety Buffer
                </span>
              </div>
              <span className="text-[10px] text-stone-500 block mt-0.5">
                Liquidity floor threshold for warning alerts
              </span>
            </div>
          </div>

          {/* Edit Settings CTA */}
          <div className="shrink-0 flex items-center">
            <Button
              variant="secondary"
              size="sm"
              icon={Settings}
              onClick={() => {
                setConfigError('');
                setConfigSuccess(false);
                setIsConfigOpen(true);
              }}
              className="text-xs"
            >
              Configure Buffer & Cash
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Configuration Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">Configure Cash Buffer & Starting Balance</h3>
                <p className="text-xs text-stone-600">Settings are persisted to the database and survive restarts.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {configError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{configError}</span>
                </div>
              )}

              {configSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Forecast settings persisted successfully!</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  Opening Cash Balance (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-mono">₹</span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={configBalance}
                    onChange={(e) => setConfigBalance(e.target.value)}
                    placeholder="e.g. 350000"
                    className="w-full pl-7 pr-3 py-2 text-xs font-mono rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <p className="text-[10px] text-stone-500">
                  User-provided starting cash position for forecasting. Not automatically verified against bank feeds.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  Minimum Desired Cash Buffer (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-mono">₹</span>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    value={configBuffer}
                    onChange={(e) => setConfigBuffer(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full pl-7 pr-3 py-2 text-xs font-mono rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <p className="text-[10px] text-stone-500">
                  Desired financial safety reserve. Days dipping below this buffer are flagged as High Risk or Critical.
                </p>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  disabled={configSaving}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={configSaving}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {configSaving ? 'Saving...' : 'Save & Recalculate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading && !data ? (
        <LoadingSpinner message="Calculating deterministic cash forecast from database records..." />
      ) : error ? (
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900">Forecast Engine Unavailable</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => fetchForecast(horizon)}>
            Try Again
          </Button>
        </div>
      ) : (
        <>
          {/* 3. Four Forecast Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Projected Ending Cash */}
            <MetricCard
              title="Projected Ending Cash"
              value={formatINR(endingCash)}
              subtitle={`Balance on Day ${horizon} (${formatDate(data?.end_date, { format: 'short' })})`}
              infoTag={endingCash >= (settings.minimum_cash_buffer ?? 0) ? 'Buffer Met' : 'Below Buffer'}
              icon={Wallet}
              accentColor={endingCash < 0 ? 'rose' : endingCash < (settings.minimum_cash_buffer ?? 0) ? 'amber' : 'emerald'}
            />

            {/* Card 2: Lowest Projected Balance */}
            <MetricCard
              title="Lowest Projected Balance"
              value={formatINR(lowestBal)}
              subtitle={data?.trough_date ? `Expected trough on ${formatDate(data.trough_date, { format: 'short' })}` : 'Throughout horizon'}
              infoTag={lowestBal < 0 ? 'Deficit' : lowestBal < (settings.minimum_cash_buffer ?? 0) ? 'Warning' : 'Protected'}
              icon={ShieldAlert}
              accentColor={lowestBal < 0 ? 'rose' : lowestBal < (settings.minimum_cash_buffer ?? 0) ? 'amber' : 'emerald'}
            />

            {/* Card 3: First Risk Date */}
            <MetricCard
              title="First Risk Date"
              value={firstRisk ? formatDate(firstRisk, { format: 'short' }) : 'No risk detected'}
              subtitle={
                firstRisk
                  ? `Closing balance dips below ₹${(settings.minimum_cash_buffer ?? 0).toLocaleString('en-IN')}`
                  : 'Buffer maintained across period'
              }
              infoTag={firstRisk ? 'Action Needed' : 'Healthy'}
              icon={firstRisk ? AlertTriangle : ShieldCheck}
              accentColor={firstRisk ? (lowestBal < 0 ? 'rose' : 'amber') : 'emerald'}
            />

            {/* Card 4: Forecast Net Movement */}
            <MetricCard
              title="Forecast Net Movement"
              value={`${netMovement >= 0 ? '+' : ''}${formatINR(netMovement)}`}
              subtitle={`Inflows: ${formatINR(data?.total_expected_inflows || 0)} | Outflows: ${formatINR(data?.total_expected_outflows || 0)}`}
              infoTag={netMovement >= 0 ? 'Cash Positive' : 'Cash Burn'}
              icon={netMovement >= 0 ? ArrowDownLeft : ArrowUpRight}
              accentColor={netMovement >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center justify-between pb-1 border-b border-stone-100 flex-wrap gap-2">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Projection Views
            </span>

            <div className="flex items-center gap-1 bg-stone-100/80 p-0.5 rounded-lg border border-stone-200/60">
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                  viewMode === 'both'
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Both
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                  viewMode === 'chart'
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" /> Chart
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" /> Table
              </button>
            </div>
          </div>

          {/* 4. Forecast Chart (Recharts) */}
          {(viewMode === 'both' || viewMode === 'chart') && (
            <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-emerald-700" /> Projected Cash Balance
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Deterministic daily trajectory based on customer receivables, supplier bills, and scheduled direct movements.
                  </p>
                </div>
              </div>

              <CashFlowTrendChart
                data={timeline}
                safeReserve={settings.minimum_cash_buffer ?? data?.target_reserve ?? 50000}
                height={320}
                timeRange={horizon}
                onRangeChange={(days) => setHorizon(days)}
                isLoading={loading}
              />
            </div>
          )}

          {/* 5. Daily Forecast Table */}
          {(viewMode === 'both' || viewMode === 'table') && (
            <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-emerald-700" /> Daily Cash Forecast
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Day-by-day cash flow ledger for all {timeline.length} days in the {horizon}-day forecast period.
                  </p>
                </div>

                <span className="text-[11px] font-mono text-stone-500">
                  Showing {timeline.length} daily periods
                </span>
              </div>

              {timeline.length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs">
                  No forecast records available for this period.
                </div>
              ) : (
                <div className="overflow-x-auto border border-stone-200 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#faf8f5] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Opening Balance</th>
                        <th className="py-2.5 px-3 text-right">Expected Inflows</th>
                        <th className="py-2.5 px-3 text-right">Expected Outflows</th>
                        <th className="py-2.5 px-3 text-right">Net Movement</th>
                        <th className="py-2.5 px-3 text-right">Projected Closing Balance</th>
                        <th className="py-2.5 px-3 text-center">Risk</th>
                        <th className="py-2.5 px-2 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {timeline.map((row) => {
                        const isNeg = row.is_negative || row.closing_balance < 0;
                        const isBelow = row.is_below_buffer || row.closing_balance < (settings.minimum_cash_buffer ?? 0);
                        const isExpanded = expandedDate === row.date;
                        const hasItems = (row.inflows_breakdown?.length > 0) || (row.outflows_breakdown?.length > 0);

                        // Row background highlighting for negative or below buffer
                        let rowClass = 'hover:bg-stone-50/70 transition-colors duration-150';
                        if (isNeg) {
                          rowClass = 'bg-rose-50/40 hover:bg-rose-50/70';
                        } else if (isBelow) {
                          rowClass = 'bg-amber-50/30 hover:bg-amber-50/60';
                        }

                        return (
                          <React.Fragment key={row.date}>
                            <tr className={rowClass}>
                              {/* Date */}
                              <td className="py-2.5 px-3 font-mono font-medium text-stone-800">
                                {formatDate(row.date, { format: 'dayMonth' })}
                                <span className="text-[10px] text-stone-400 block font-sans">
                                  {formatDate(row.date, { format: 'short' })}
                                </span>
                              </td>

                              {/* Opening Balance */}
                              <td className="py-2.5 px-3 text-right font-mono text-stone-700">
                                {formatINR(row.opening_balance)}
                              </td>

                              {/* Expected Inflows */}
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                                {row.expected_inflows > 0 ? `+${formatINR(row.expected_inflows)}` : '₹0'}
                              </td>

                              {/* Expected Outflows */}
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-700">
                                {row.expected_outflows > 0 ? `-${formatINR(row.expected_outflows)}` : '₹0'}
                              </td>

                              {/* Net Movement */}
                              <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                                row.net_movement > 0
                                  ? 'text-emerald-700'
                                  : row.net_movement < 0
                                    ? 'text-rose-700'
                                    : 'text-stone-500'
                              }`}>
                                {row.net_movement > 0 ? '+' : ''}{formatINR(row.net_movement)}
                              </td>

                              {/* Projected Closing Balance */}
                              <td className={`py-2.5 px-3 text-right font-mono font-bold text-sm ${
                                isNeg
                                  ? 'text-rose-700'
                                  : isBelow
                                    ? 'text-amber-800'
                                    : 'text-stone-900'
                              }`}>
                                {formatINR(row.closing_balance)}
                              </td>

                              {/* Risk Badge */}
                              <td className="py-2.5 px-3 text-center">
                                {isNeg ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                    Critical
                                  </span>
                                ) : isBelow ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    High Risk
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    Healthy
                                  </span>
                                )}
                              </td>

                              {/* Expand/Collapse Breakdown Toggle */}
                              <td className="py-2.5 px-2 text-center">
                                {hasItems ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDate(isExpanded ? null : row.date)}
                                    className="p-1 text-stone-400 hover:text-stone-700 rounded hover:bg-stone-100 transition-colors cursor-pointer"
                                    title={isExpanded ? 'Hide movements breakdown' : 'Show movements breakdown'}
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-stone-300">—</span>
                                )}
                              </td>
                            </tr>

                            {/* Expanded Itemization Drawer for this date */}
                            {isExpanded && hasItems && (
                              <tr className="bg-stone-50/80 border-b border-stone-200">
                                <td colSpan="8" className="p-3">
                                  <div className="space-y-2 text-xs">
                                    <div className="font-semibold text-stone-700 text-[11px] uppercase tracking-wider">
                                      Cash Movements Breakdown for {formatDate(row.date, { format: 'full' })}:
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {/* Inflows */}
                                      <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1.5">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                                          Expected Inflows ({row.inflows_breakdown?.length || 0})
                                        </span>
                                        {row.inflows_breakdown && row.inflows_breakdown.length > 0 ? (
                                          <ul className="space-y-1 divide-y divide-stone-100">
                                            {row.inflows_breakdown.map((item, idx) => (
                                              <li key={idx} className="pt-1 flex items-center justify-between text-stone-700">
                                                <div>
                                                  <span className="font-semibold">{item.reference || item.entity}</span>
                                                  <span className="text-[10px] text-stone-500 block truncate max-w-xs">{item.description}</span>
                                                </div>
                                                <span className="font-mono font-bold text-emerald-700">+{formatINR(item.amount)}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <span className="text-stone-400 text-[11px]">No expected inflows</span>
                                        )}
                                      </div>

                                      {/* Outflows */}
                                      <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1.5">
                                        <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                                          Expected Outflows ({row.outflows_breakdown?.length || 0})
                                        </span>
                                        {row.outflows_breakdown && row.outflows_breakdown.length > 0 ? (
                                          <ul className="space-y-1 divide-y divide-stone-100">
                                            {row.outflows_breakdown.map((item, idx) => (
                                              <li key={idx} className="pt-1 flex items-center justify-between text-stone-700">
                                                <div>
                                                  <span className="font-semibold">{item.reference || item.entity}</span>
                                                  <span className="text-[10px] text-stone-500 block truncate max-w-xs">{item.description}</span>
                                                </div>
                                                <span className="font-mono font-bold text-rose-700">-{formatINR(item.amount)}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <span className="text-stone-400 text-[11px]">No scheduled outflows</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 6. Explainability and Reliability Card (Section 11) */}
          <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
            <div className="flex items-center gap-2 text-stone-800">
              <Info className="w-4 h-4 text-emerald-700" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Forecasting Methodology & Verification Principles
              </h4>
            </div>
            <div className="text-xs text-stone-600 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-[#faf8f5] border border-stone-200/60">
                <strong className="block text-stone-900 font-semibold mb-1">Deterministic Formula</strong>
                <code className="text-[11px] font-mono bg-stone-100 px-1 py-0.5 rounded text-stone-800 block mb-1">
                  Closing = Previous + Inflows - Outflows
                </code>
                Calculated strictly from outstanding customer invoices, supplier commitments, and direct transactions stored in the SQLite database.
              </div>

              <div className="p-2.5 rounded-lg bg-[#faf8f5] border border-stone-200/60">
                <strong className="block text-stone-900 font-semibold mb-1">Safe Deduplication</strong>
                Historical transactions completed on or before the start date are not double-counted (already captured in opening cash). Unlinked scheduled transactions contribute on their respective dates.
              </div>

              <div className="p-2.5 rounded-lg bg-[#faf8f5] border border-stone-200/60">
                <strong className="block text-stone-900 font-semibold mb-1">Risk Precedence</strong>
                Precedence order: Critical (&lt; ₹0), High Risk (0 to buffer), and Healthy (&ge; buffer). No fabricated percentage changes or unsupported predictions.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
