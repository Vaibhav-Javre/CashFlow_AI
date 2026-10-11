import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Plus,
  Sliders,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import MetricCard from '../components/common/MetricCard';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import CashFlowTrendChart from '../components/charts/CashFlowTrendChart';
import UpcomingTransactionsTable from '../components/dashboard/UpcomingTransactionsTable';
import CashFlowInsightCard from '../components/dashboard/CashFlowInsightCard';
import ConfirmedExpensesModal from '../components/dashboard/ConfirmedExpensesModal';
import { api } from '../api/client';
import { formatINR, formatDate } from '../utils/formatters';

export default function Dashboard({ onOpenNewTransaction }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [selectedRange, setSelectedRange] = useState(30);
  const [error, setError] = useState(null);
  const [isFixedExpensesOpen, setIsFixedExpensesOpen] = useState(false);

  // Fetch initial dashboard metrics
  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary, forecast, and recent transactions concurrently
      const [dashRes, foreRes, txRes] = await Promise.all([
        api.getDashboardSummary().catch(() => null),
        api.getForecast(selectedRange).catch(() => null),
        api.getTransactions({ limit: 8, sort_by: 'date', sort_order: 'desc' }).catch(() => null)
      ]);

      if (dashRes && dashRes.data) {
        setDashboardData(dashRes.data);
      }
      if (foreRes && foreRes.data) {
        setForecastData(foreRes.data);
      }
      if (txRes && txRes.data) {
        setRecentTransactions(Array.isArray(txRes.data) ? txRes.data : []);
      }
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handler for time-range selection (7, 30, 60 days)
  const handleTimeRangeChange = async (days) => {
    setSelectedRange(days);
    setChartLoading(true);
    try {
      const res = await api.getForecast(days);
      if (res && res.data) {
        setForecastData(res.data);
      }
    } catch (err) {
      console.warn(`Failed to fetch ${days}-day forecast from backend, adjusting view:`, err);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading financial position..." />;
  }

  // Derive values safely from backend summary
  const summary = dashboardData?.summary || {};
  const currentCash = summary.current_balance !== undefined
    ? summary.current_balance
    : 0;

  const targetReserve = summary.target_reserve !== undefined
    ? summary.target_reserve
    : 0;

  const totalReceivables = summary.total_receivables !== undefined
    ? summary.total_receivables
    : 0;

  const overdueReceivables = summary.overdue_receivables !== undefined
    ? summary.overdue_receivables
    : 0;

  const totalPayables = summary.total_payables !== undefined
    ? summary.total_payables
    : 0;

  const criticalPayables = summary.critical_payables !== undefined
    ? summary.critical_payables
    : 0;

  // Determine risk level based on minimum projected balance vs buffer
  const minProjected = forecastData?.minimum_projected_balance !== undefined
    ? forecastData.minimum_projected_balance
    : currentCash * 0.85;

  const isShortfall = currentCash < targetReserve || (forecastData?.is_shortfall_predicted !== undefined
    ? forecastData.is_shortfall_predicted
    : minProjected < targetReserve);

  // Derive risk level from backend RiskService (single source of truth)
  const backendRisk = dashboardData?.risk_analysis;
  let rawStatus = backendRisk?.overall_risk || (forecastData?.lowest_projected_balance !== undefined
    ? (forecastData.lowest_projected_balance < 0
      ? 'Critical'
      : forecastData.lowest_projected_balance < targetReserve
        ? 'High'
        : (dashboardData?.active_risks?.length > 0 || overdueReceivables > 0)
          ? 'Moderate'
          : 'Healthy')
    : 'Healthy');

  // Hard safety invariant: If liquid cash is currently below buffer, it can never show Healthy
  if (currentCash < 0) {
    rawStatus = 'Critical';
  } else if (currentCash < targetReserve && (rawStatus === 'Healthy' || rawStatus === 'Moderate')) {
    rawStatus = 'High';
  }

  const riskStatus = rawStatus;
  let riskVariant = 'success';
  if (riskStatus === 'Critical') {
    riskVariant = 'danger';
  } else if (riskStatus === 'High') {
    riskVariant = 'danger';
  } else if (riskStatus === 'Moderate') {
    riskVariant = 'warning';
  } else {
    riskVariant = 'success';
  }

  const riskExplanation = backendRisk?.primary_cause || dashboardData?.forecast_highlight?.insight || 'Cash balance projected to remain above minimum buffer';

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Financial Command Center
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Real-time cash position, scheduled commitments, and liquidity projections
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setIsFixedExpensesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer shadow-2xs"
            title="Set recurring employee salary, power bills, workshop rent"
          >
            <span>⚙️ Confirmed Expenses</span>
          </button>
          <Button
            variant="secondary"
            size="sm"
            icon={Sliders}
            onClick={() => navigate('/simulator')}
          >
            What-If Simulator
          </Button>
          <button
            onClick={() => onOpenNewTransaction && onOpenNewTransaction('Expense')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-all cursor-pointer"
            title="Record spending today (e.g. ₹1,00,000 for new items) or schedule future payment"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+ Add Expense</span>
          </button>
          <Button
            variant="primary"
            size="sm"
            icon={ArrowDownLeft}
            onClick={() => onOpenNewTransaction && onOpenNewTransaction('Income')}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            + Record Income
          </Button>
        </div>
      </div>

      {/* Onboarding Banner for Clean Workspaces with No Transactions */}
      {recentTransactions.length === 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              ⚙️
            </div>
            <div>
              <h3 className="text-xs font-bold text-stone-900">
                Setup Confirmed Fixed Expenses (Salaries, Electricity, Rent)
              </h3>
              <p className="text-[11px] text-stone-600 mt-0.5">
                Set mandatory month-end fixed commitments so CashFlow AI can project your true closing cash runway and prevent payroll shortfalls.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsFixedExpensesOpen(true)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 cursor-pointer shadow-xs"
          >
            + Set Confirmed Expenses
          </button>
        </div>
      )}

      {/* 1. Four Summary KPI Cards (Requirement 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Available Cash */}
        <MetricCard
          title="Available Cash"
          value={formatINR(currentCash)}
          subtitle={`Min Buffer: ${formatINR(targetReserve)}`}
          infoTag={currentCash >= targetReserve ? 'Buffer Maintained' : 'Below Buffer'}
          icon={Wallet}
          accentColor={currentCash >= targetReserve ? 'emerald' : 'amber'}
        />

        {/* Card 2: Expected Receivables */}
        <MetricCard
          title="Expected Receivables"
          value={formatINR(totalReceivables)}
          subtitle={overdueReceivables > 0 ? `Overdue: ${formatINR(overdueReceivables)}` : 'All invoices on schedule'}
          infoTag={`${summary.overdue_invoices_count || 0} overdue`}
          icon={ArrowDownLeft}
          accentColor={overdueReceivables > 0 ? 'amber' : 'emerald'}
        />

        {/* Card 3: Upcoming Payables */}
        <MetricCard
          title="Upcoming Payables"
          value={formatINR(totalPayables)}
          subtitle={criticalPayables > 0 ? `Critical: ${formatINR(criticalPayables)}` : 'No critical obligations'}
          infoTag={`${summary.total_bills || 0} bills`}
          icon={ArrowUpRight}
          accentColor={criticalPayables > 0 ? 'rose' : 'stone'}
        />

        {/* Card 4: Cash-Flow Risk & Projected Floor */}
        <MetricCard
          title="Cash-Flow Risk"
          value={riskStatus}
          statusBadge={{ text: riskStatus, variant: riskVariant }}
          subtitle={
            backendRisk?.first_risk_date && backendRisk.first_risk_date !== 'No risk detected'
              ? `First risk: ${formatDate(backendRisk.first_risk_date, { format: 'short' })} | Lowest: ${formatINR(backendRisk.lowest_projected_balance ?? minProjected)}`
              : `Lowest: ${formatINR(backendRisk?.lowest_projected_balance ?? minProjected)} (No risk detected)`
          }
          icon={riskStatus === 'Healthy' ? ShieldCheck : ShieldAlert}
          accentColor={riskStatus === 'Healthy' ? 'emerald' : riskStatus === 'Moderate' ? 'amber' : 'rose'}
          onClick={() => navigate('/risks')}
        />
      </div>

      {/* 2. Main Analytics Section: Chart + Insight Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash-Flow Forecast Chart (2 Columns on large screens) */}
        <div className="lg:col-span-2 p-4 sm:p-6 rounded-xl bg-white border border-stone-200 shadow-2xs flex flex-col justify-between">
          <div className="mb-2">
            <h3 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-700" />
              Cash-Flow Forecast
            </h3>
            <p className="text-xs text-stone-600">
              Projected balance incorporating confirmed receivables, supplier obligations, and operating burn
            </p>
          </div>

          <CashFlowTrendChart
            data={forecastData?.timeline}
            safeReserve={targetReserve}
            height={290}
            timeRange={selectedRange}
            onRangeChange={handleTimeRangeChange}
            isLoading={chartLoading}
          />
        </div>

        {/* Cash-Flow Insight & Quick Tactics Card */}
        <div className="space-y-4 flex flex-col justify-between">
          {/* Rule-Based Cash-Flow Insight Card (Requirement 7) */}
          <CashFlowInsightCard
            hasBreach={isShortfall}
            breachDate={forecastData?.reserve_breach_date || forecastData?.trough_date}
            troughBalance={minProjected}
            safeReserve={targetReserve}
            timeRange={selectedRange}
          />

          {/* Compact Recommended Action Section (Requirement 9) */}
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-stone-900">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Recommended Action
                </h4>
              </div>

              {dashboardData?.recommended_action && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  dashboardData.recommended_action.priority === 'Critical'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : dashboardData.recommended_action.priority === 'High'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-stone-100 text-stone-700 border border-stone-200'
                }`}>
                  {dashboardData.recommended_action.priority}
                </span>
              )}
            </div>

            {dashboardData?.recommended_action ? (
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-stone-900">
                  {dashboardData.recommended_action.title}
                </h5>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {dashboardData.recommended_action.suggested_action || dashboardData.recommended_action.explanation}
                </p>
                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 font-mono">
                  {dashboardData.recommended_action.relevant_date && (
                    <span>Due: {formatDate(dashboardData.recommended_action.relevant_date)}</span>
                  )}
                  {dashboardData.recommended_action.estimated_impact > 0 && (
                    <span className="font-bold text-emerald-800">
                      Impact: {formatINR(dashboardData.recommended_action.estimated_impact)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-emerald-700 font-medium">
                No urgent actions required. Cash flow and reserves remain on track.
              </p>
            )}

            <div className="pt-2 border-t border-stone-100 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs"
                onClick={() => navigate('/recommendations')}
              >
                View All Recommendations &rarr;
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Upcoming Transactions Table */}
      <UpcomingTransactionsTable
        transactions={recentTransactions}
        onOpenFixedExpenses={() => setIsFixedExpensesOpen(true)}
        onRefresh={fetchDashboard}
      />

      {/* Confirmed Fixed Expenses Modal */}
      <ConfirmedExpensesModal
        isOpen={isFixedExpensesOpen}
        onClose={() => setIsFixedExpensesOpen(false)}
        onSaved={fetchDashboard}
        onOpenOneTimeExpense={() => onOpenNewTransaction && onOpenNewTransaction('Expense')}
      />
    </div>
  );
}
