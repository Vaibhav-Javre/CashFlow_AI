import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Clock,
  CheckCircle2,
  Users,
  PieChart as PieIcon,
  ArrowRight,
  TrendingDown,
  Info,
  Sparkles,
  Layers,
  X,
  FileText,
  RotateCcw
} from 'lucide-react';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { api } from '../api/client';
import { formatINR, formatINRAxis, formatDate } from '../utils/formatters';

export default function RiskCenter() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(30);
  const [resolvingId, setResolvingId] = useState(null);
  const [activeModalItem, setActiveModalItem] = useState(null);

  const fetchRiskCenter = async (days = selectedDays) => {
    try {
      setLoading(true);
      const res = await api.getRiskCenter(days);
      if (res && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch risk center data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskCenter(selectedDays);
  }, [selectedDays]);

  const handlePeriodChange = (days) => {
    setSelectedDays(days);
  };

  const handleResolveAlert = async (id) => {
    try {
      setResolvingId(id);
      await api.resolveRisk(id);
      await fetchRiskCenter(selectedDays);
    } catch (err) {
      alert('Error resolving alert: ' + err.message);
    } finally {
      setResolvingId(null);
    }
  };

  if (loading && !data) {
    return <LoadingSpinner message="Scanning cash flow risk signals & forecast timeline..." />;
  }

  // Derive metrics safely from backend risk analysis
  const overallRisk = data?.overall_risk || 'Healthy';
  const firstRiskDate = data?.first_risk_date;
  const lowestBalance = data?.lowest_projected_balance ?? 0;
  const buffer = data?.minimum_cash_buffer ?? 500000;
  const potentialShortfall = data?.potential_shortfall ?? Math.max(0, buffer - lowestBalance);
  const bufferDeficit = data?.buffer_deficit ?? potentialShortfall;
  const negativeDeficit = data?.negative_balance_deficit ?? Math.max(0, -lowestBalance);
  const hasNegative = data?.has_negative_balance || lowestBalance < 0;
  const timeline = data?.timeline || [];
  const causes = data?.causes || [];
  const riskEvents = data?.risk_events || [];
  const priorityActions = data?.priority_actions || [];
  const distinctPeriods = data?.distinct_risk_periods || [];
  const riskDatesCount = data?.risk_dates_count ?? 0;

  // Badge styling for Overall Risk
  const getOverallRiskBadge = (risk) => {
    switch (risk) {
      case 'Critical':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-600',
          cardBorder: 'border-rose-300',
          icon: ShieldAlert,
          iconColor: 'text-rose-600'
        };
      case 'High':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-600',
          cardBorder: 'border-amber-300',
          icon: AlertTriangle,
          iconColor: 'text-amber-600'
        };
      case 'Moderate':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          cardBorder: 'border-amber-200',
          icon: AlertCircle,
          iconColor: 'text-amber-600'
        };
      case 'Healthy':
      default:
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-600',
          cardBorder: 'border-emerald-200',
          icon: ShieldCheck,
          iconColor: 'text-emerald-600'
        };
    }
  };

  const riskBadge = getOverallRiskBadge(overallRisk);
  const RiskIcon = riskBadge.icon;

  // Custom rich tooltip for Risk Timeline
  const CustomTimelineTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0].payload;
    const closing = pt.closing_balance ?? pt.projected_balance ?? 0;
    const inflows = pt.expected_inflows ?? pt.inflow ?? 0;
    const outflows = pt.expected_outflows ?? pt.outflow ?? 0;
    const daySeverity = pt.risk_severity || (closing < 0 ? 'CRITICAL' : closing < buffer ? 'HIGH' : 'HEALTHY');

    return (
      <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-lg text-xs space-y-2 min-w-[230px] z-50">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <span className="font-semibold text-stone-800">{formatDate(label, { format: 'full' })}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            daySeverity === 'CRITICAL'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : daySeverity === 'HIGH'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {daySeverity}
          </span>
        </div>

        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between text-stone-600">
            <span>Projected Balance:</span>
            <span className={`font-bold ${closing < 0 ? 'text-rose-700' : closing < buffer ? 'text-amber-800' : 'text-emerald-700'}`}>
              {formatINR(closing)}
            </span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Expected Inflows:</span>
            <span>+{formatINR(inflows)}</span>
          </div>
          <div className="flex justify-between text-rose-700">
            <span>Expected Outflows:</span>
            <span>-{formatINR(outflows)}</span>
          </div>
          {pt.buffer_deficit > 0 && (
            <div className="flex justify-between text-amber-800 border-t border-stone-100 pt-1">
              <span>Buffer Deficit:</span>
              <span>{formatINR(pt.buffer_deficit)}</span>
            </div>
          )}
          {pt.negative_balance_deficit > 0 && (
            <div className="flex justify-between text-rose-700 font-bold">
              <span>Negative Deficit:</span>
              <span>{formatINR(pt.negative_balance_deficit)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-fast pb-12">
      {/* 1. Header & Forecast Period Selector (Requirement 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-stone-800" /> AI Risk Center
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Identify potential cash shortages before they happen.
          </p>
        </div>

        {/* Period Selector: 7 Days, 30 Days, 60 Days */}
        <div className="flex items-center gap-1.5 bg-stone-100/90 p-1 rounded-xl border border-stone-200 self-start sm:self-auto">
          {[7, 30, 60].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => handlePeriodChange(days)}
              disabled={loading}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                selectedDays === days
                  ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* 2. Four Risk Summary Cards (Requirement 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card A: Overall Risk */}
        <div className={`p-4 sm:p-5 rounded-xl bg-white border ${riskBadge.cardBorder} shadow-2xs space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Overall Risk</span>
            <RiskIcon className={`w-4 h-4 ${riskBadge.iconColor}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-bold border ${riskBadge.bg}`}>
              <span className={`w-2 h-2 rounded-full ${riskBadge.dot}`} />
              {overallRisk}
            </span>
          </div>
          <p className="text-[11px] text-stone-600 leading-snug pt-1 line-clamp-2">
            {data?.classification_rule}
          </p>
        </div>

        {/* Card B: First Risk Date */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">First Risk Date</span>
            <Calendar className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-stone-900">
            {firstRiskDate && firstRiskDate !== 'No risk detected' ? (
              <span className="font-mono text-stone-900">{formatDate(firstRiskDate, { format: 'medium' })}</span>
            ) : (
              <span className="text-emerald-700 text-base font-semibold">No risk detected</span>
            )}
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            {firstRiskDate && firstRiskDate !== 'No risk detected'
              ? `Earliest projected breach below ₹${buffer.toLocaleString('en-IN')} buffer`
              : `Balance remains safe across the ${selectedDays}-day forecast`}
          </p>
        </div>

        {/* Card C: Lowest Projected Balance */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Lowest Projected Balance</span>
            <TrendingDown className={`w-4 h-4 ${lowestBalance < 0 ? 'text-rose-600' : lowestBalance < buffer ? 'text-amber-600' : 'text-emerald-600'}`} />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono">
            <span className={lowestBalance < 0 ? 'text-rose-700' : lowestBalance < buffer ? 'text-amber-800' : 'text-emerald-700'}>
              {formatINR(lowestBalance)}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            {data?.trough_date ? `Projected low on ${formatDate(data.trough_date)}` : 'Safe margin maintained'}
          </p>
        </div>

        {/* Card D: Potential Cash Shortfall */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Potential Cash Shortfall</span>
            <Clock className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono">
            <span className={potentialShortfall > 0 ? (hasNegative ? 'text-rose-700' : 'text-amber-800') : 'text-stone-900'}>
              {formatINR(potentialShortfall)}
            </span>
          </div>
          <div className="text-[11px] text-stone-600 leading-snug space-y-0.5">
            {hasNegative ? (
              <span className="text-rose-700 block font-semibold">
                Deficit below zero: {formatINR(negativeDeficit)}
              </span>
            ) : potentialShortfall > 0 ? (
              <span className="text-amber-800 block">
                Required to restore ₹{buffer.toLocaleString('en-IN')} buffer
              </span>
            ) : (
              <span className="text-emerald-700 block">
                Full buffer satisfied (₹0 shortfall)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Risk Timeline (Requirement 4) */}
      <div className="p-4 sm:p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-stone-700" />
              Projected Cash Position Timeline ({selectedDays} Days)
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Daily forecast showing projected closing balance against the configured minimum buffer (₹{buffer.toLocaleString('en-IN')})
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {riskDatesCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {riskDatesCount} risk date(s) across {distinctPeriods.length} distinct period(s)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                No buffer breaches projected in period
              </span>
            )}
          </div>
        </div>

        {/* Timeline Chart Area */}
        <div className="w-full h-[280px] sm:h-[320px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="riskTimelineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={hasNegative ? "#f43f5e" : "#10b981"} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={hasNegative ? "#f43f5e" : "#10b981"} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#f1ede8" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatDate(d, { format: 'dayMonth' })}
                stroke="#a8a29e"
                tick={{ fill: '#78716c', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e7e5e4' }}
              />

              <YAxis
                tickFormatter={formatINRAxis}
                stroke="#a8a29e"
                tick={{ fill: '#78716c', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e7e5e4' }}
              />

              <Tooltip content={<CustomTimelineTooltip />} />

              {/* Minimum Cash Buffer Reference Line */}
              <ReferenceLine
                y={buffer}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Min Buffer: ${formatINR(buffer, { compact: true })}`,
                  fill: '#b45309',
                  fontSize: 11,
                  position: 'insideTopLeft'
                }}
              />

              {/* Zero Deficit Line if negative */}
              {hasNegative && (
                <ReferenceLine
                  y={0}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Cash Deficit Line (₹0)',
                    fill: '#dc2626',
                    fontSize: 10,
                    position: 'insideBottomLeft'
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey="closing_balance"
                stroke={hasNegative ? "#e11d48" : "#059669"}
                strokeWidth={2.5}
                fill="url(#riskTimelineGrad)"
                activeDot={{ r: 5, fill: hasNegative ? "#e11d48" : "#059669", stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between text-xs text-stone-600 gap-3">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
              Projected Balance
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block" />
              Minimum Buffer ({formatINR(buffer)})
            </span>
            {hasNegative && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-500 inline-block" />
                Negative Balance (&lt; ₹0)
              </span>
            )}
          </div>

          <div className="font-mono text-stone-700">
            Formula: <span className="text-stone-500">Shortfall = max(0, Buffer - Lowest Balance)</span>
          </div>
        </div>
      </div>

      {/* 4. Section 5: Identify the Causes of Risk ("Why Is My Cash at Risk?") */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-stone-800" />
              Why Is My Cash at Risk?
            </h2>
            <p className="text-xs text-stone-600">
              Explainable drivers identified from actual database records and payment timing
            </p>
          </div>
        </div>

        {causes.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-white border border-stone-200 shadow-2xs">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 text-emerald-600" />
            <h3 className="text-sm font-bold text-stone-900">No Risk Bottlenecks Detected</h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Cash inflows and reserves comfortably cover scheduled commitments across the {selectedDays}-day forecast.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {causes.map((cause, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs hover:border-stone-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        cause.cause_type === 'TIMING_MISMATCH'
                          ? 'bg-amber-100 text-amber-800'
                          : cause.cause_type === 'OVERDUE_INVOICE'
                            ? 'bg-rose-100 text-rose-800'
                            : cause.cause_type === 'CLUSTERED_OUTFLOWS'
                              ? 'bg-amber-100 text-amber-800'
                              : cause.cause_type === 'HEALTHY_COVERAGE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-stone-100 text-stone-800'
                      }`}>
                        {cause.cause_type.replace('_', ' ')}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-bold text-stone-900">
                      {formatINR(cause.amount)}
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                    {cause.title}
                  </h3>

                  <p className="text-xs text-stone-700 leading-relaxed">
                    {cause.short_explanation}
                  </p>

                  <div className="p-2.5 rounded-lg bg-[#faf8f5] border border-stone-200/80 text-xs">
                    <strong className="text-stone-900">Why it matters:</strong>{' '}
                    <span className="text-stone-700">{cause.why_it_matters}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3 text-stone-400" />
                    {formatDate(cause.date)}
                  </span>

                  {cause.related_record_number && (
                    <span className="font-mono text-stone-700 font-medium">
                      Ref: {cause.related_record_number}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Section 7: Upcoming Risk Events */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-800" />
            Upcoming Risk Events
          </h2>
          <p className="text-xs text-stone-600">
            Deduplicated threat timeline requiring liquidity attention
          </p>
        </div>

        {riskEvents.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-white border border-stone-200 shadow-2xs">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 text-emerald-600" />
            <h3 className="text-sm font-bold text-stone-900">No Upcoming Risk Events</h3>
            <p className="text-xs text-stone-600 mt-0.5">
              All scheduled obligations remain within safe buffer margins over the next {selectedDays} days.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {riskEvents.map((event) => (
              <div
                key={event.id}
                className={`p-4 rounded-xl border shadow-2xs transition-all ${
                  event.severity === 'CRITICAL'
                    ? 'bg-rose-50/60 border-rose-200'
                    : event.severity === 'HIGH' || event.severity === 'WARNING'
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        event.severity === 'CRITICAL'
                          ? 'bg-rose-600 text-white'
                          : event.severity === 'HIGH' || event.severity === 'WARNING'
                            ? 'bg-amber-600 text-white'
                            : 'bg-stone-700 text-white'
                      }`}>
                        {event.severity}
                      </span>
                      <h3 className="text-xs sm:text-sm font-bold text-stone-900">{event.title}</h3>
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed">
                      {event.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-600 pt-0.5">
                      {event.date && (
                        <span>Date: <strong className="text-stone-800">{formatDate(event.date)}</strong></span>
                      )}
                      {event.potential_amount_at_risk > 0 && (
                        <span>Potential Shortfall: <strong className="font-mono text-stone-900">{formatINR(event.potential_amount_at_risk)}</strong></span>
                      )}
                      {event.related_record_label && (
                        <span className="text-stone-500 font-mono">({event.related_record_label})</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveModalItem(event)}
                    >
                      View Details
                    </Button>

                    {event.db_alert_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={resolvingId === event.db_alert_id}
                        onClick={() => handleResolveAlert(event.db_alert_id)}
                        className="text-xs text-stone-600 hover:text-stone-900"
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Section 8: Priority Actions (Rule-Based Financial Actions) */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            Priority Actions
          </h2>
          <p className="text-xs text-stone-600">
            Rule-based suggestions to protect liquidity, ranked by financial impact
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {priorityActions.map((action, idx) => (
            <div
              key={action.action_id || idx}
              className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    action.urgency === 'HIGH'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : action.urgency === 'MEDIUM'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-stone-100 text-stone-700 border border-stone-200'
                  }`}>
                    {action.urgency} URGENCY
                  </span>

                  {action.potential_impact_amount > 0 && (
                    <span className="font-mono text-xs font-bold text-emerald-800">
                      Impact: {formatINR(action.potential_impact_amount)}
                    </span>
                  )}
                </div>

                <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                  {action.title}
                </h3>

                <p className="text-xs text-stone-800 leading-relaxed">
                  {action.recommended_action}
                </p>

                <div className="p-2.5 rounded-lg bg-[#faf8f5] border border-stone-200 text-xs text-stone-600">
                  <strong className="text-stone-800">Reason:</strong> {action.reason}
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                <span className="text-[11px] text-stone-500 font-mono">
                  {action.category}
                </span>

                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs"
                  onClick={() => {
                    if (action.target_type === 'receivable') {
                      navigate('/receivables');
                    } else if (action.target_type === 'payable') {
                      navigate('/payables');
                    } else if (action.target_type === 'forecast_settings') {
                      navigate('/forecast');
                    } else {
                      navigate('/simulator');
                    }
                  }}
                >
                  Investigate &rarr;
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-stone-500 italic pt-1">
          {data?.disclaimer}
        </p>
      </div>

      {/* 7. Preserved Debtor Concentration & Aging Brackets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {/* Concentration */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-stone-700" />
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Customer Concentration</h3>
          </div>

          <div className="space-y-2.5">
            {data?.debtor_concentration?.map((debtor) => (
              <div key={debtor.customer_name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-stone-800">{debtor.customer_name}</span>
                  <span className="font-mono text-stone-600 font-medium">
                    {formatINR(debtor.total_amount)} ({debtor.concentration_pct}%)
                  </span>
                </div>
                <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      debtor.concentration_pct > 25
                        ? 'bg-rose-500'
                        : debtor.concentration_pct > 15
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(debtor.concentration_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Aging */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-stone-700" />
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Receivables Aging Brackets</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
              <span className="text-[10px] text-stone-600 font-bold uppercase block">Current (0d)</span>
              <span className="text-base font-bold text-stone-900 font-mono mt-0.5 block">
                {formatINR(data?.aging_breakdown?.current)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
              <span className="text-[10px] text-stone-600 font-bold uppercase block">1 - 15 Days</span>
              <span className="text-base font-bold text-stone-900 font-mono mt-0.5 block">
                {formatINR(data?.aging_breakdown?.days_1_15)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200">
              <span className="text-[10px] text-amber-800 font-bold uppercase block">16 - 30 Days</span>
              <span className="text-base font-bold text-amber-800 font-mono mt-0.5 block">
                {formatINR(data?.aging_breakdown?.days_16_30)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200">
              <span className="text-[10px] text-rose-800 font-bold uppercase block">31+ Days</span>
              <span className="text-base font-bold text-rose-700 font-mono mt-0.5 block">
                {formatINR(data?.aging_breakdown?.days_31_plus)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Working View Details Modal - Portalled to document.body */}
      {activeModalItem && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/50 backdrop-blur-xs overflow-y-auto animate-fade-fast"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModalItem(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto animate-pop-fast">
            <div className="flex items-center justify-between border-b border-stone-100 p-5 shrink-0">
              <div className="flex items-center gap-2 pr-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  activeModalItem.severity === 'CRITICAL'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}>
                  {activeModalItem.severity}
                </span>
                <h3 className="text-sm font-bold text-stone-900 leading-snug">{activeModalItem.title}</h3>
              </div>

              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs p-5 overflow-y-auto">
              <p className="text-stone-700 leading-relaxed">
                {activeModalItem.description}
              </p>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] p-3 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <span className="text-stone-500 block">Date of Risk:</span>
                  <span className="font-bold text-stone-900">{formatDate(activeModalItem.date)}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Potential Amount at Risk:</span>
                  <span className="font-bold text-rose-700">{formatINR(activeModalItem.potential_amount_at_risk)}</span>
                </div>
              </div>

              {activeModalItem.mitigation_hint && (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                  <strong className="text-emerald-900">Recommended Next Step:</strong>
                  <p className="text-stone-800 mt-1">{activeModalItem.mitigation_hint}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModalItem(null)}
              >
                Close
              </Button>

              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => {
                  setActiveModalItem(null);
                  if (activeModalItem.related_record_type === 'receivable') {
                    navigate('/receivables');
                  } else if (activeModalItem.related_record_type === 'payable') {
                    navigate('/payables');
                  } else {
                    navigate('/forecast');
                  }
                }}
              >
                Investigate in Module &rarr;
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
