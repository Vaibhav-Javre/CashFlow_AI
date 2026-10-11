import React from 'react';
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
import { formatINR, formatINRAxis, formatDate } from '../../utils/formatters';
import { AlertCircle, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

export default function CashFlowTrendChart({
  data = [],
  safeReserve = 500000,
  height = 320,
  timeRange = 30,
  onRangeChange,
  isLoading = false
}) {
  const minProjected = data && data.length > 0
    ? Math.min(...data.map(d => d.projected_balance ?? d.closing_balance ?? 0))
    : 0;

  const hasNegative = minProjected < 0;
  const hasBreachedThreshold = data && data.some((item) => (item.projected_balance ?? item.closing_balance ?? 0) < safeReserve);

  // Custom rich tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0].payload;
    const closing = pt.projected_balance ?? pt.closing_balance ?? 0;
    const opening = pt.opening_balance ?? closing;
    const inflows = pt.expected_inflows ?? pt.inflow ?? 0;
    const outflows = pt.expected_outflows ?? pt.outflow ?? 0;
    const net = pt.net_movement ?? pt.net ?? (inflows - outflows);
    const riskStatus = pt.risk_status || (closing < 0 ? 'Critical' : closing < safeReserve ? 'High Risk' : 'Healthy');

    const riskBadgeClass = closing < 0
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : closing < safeReserve
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200';

    return (
      <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-md text-xs space-y-2 min-w-[210px]">
        <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
          <span className="font-semibold text-stone-800">{formatDate(label, { format: 'full' })}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${riskBadgeClass}`}>
            {riskStatus}
          </span>
        </div>

        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between text-stone-500">
            <span>Opening Balance:</span>
            <span className="text-stone-800 font-semibold">{formatINR(opening)}</span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Expected Inflows:</span>
            <span>+{formatINR(inflows)}</span>
          </div>
          <div className="flex justify-between text-rose-700">
            <span>Expected Outflows:</span>
            <span>-{formatINR(outflows)}</span>
          </div>
          <div className="flex justify-between text-stone-600 border-t border-stone-100 pt-1">
            <span>Net Movement:</span>
            <span className={net >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
              {net >= 0 ? '+' : ''}{formatINR(net)}
            </span>
          </div>
          <div className="flex justify-between text-stone-900 border-t border-stone-200 pt-1 font-bold text-xs">
            <span>Projected Closing:</span>
            <span className={closing < 0 ? 'text-rose-700' : closing < safeReserve ? 'text-amber-800' : 'text-emerald-700'}>
              {formatINR(closing)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-3">
      {/* Chart Top Bar: Controls & Threshold Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-100">
        <div className="flex items-center gap-2">
          {hasNegative ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              Critical cash shortage projected in period
            </span>
          ) : hasBreachedThreshold ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Projected balance dips below minimum buffer
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Balance remains above minimum buffer
            </span>
          )}
        </div>

        {/* Time-Range Selector: 7 Days, 30 Days, 60 Days */}
        {onRangeChange && (
          <div className="flex items-center gap-1 bg-stone-100/80 p-0.5 rounded-lg border border-stone-200/60 self-start sm:self-auto">
            {[7, 30, 60].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onRangeChange(days)}
                disabled={isLoading}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                  timeRange === days
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {days} Days
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Display Area */}
      <div className="w-full relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-2xs flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
              <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              Calculating {timeRange}-day cash forecast...
            </div>
          </div>
        )}

        {!data || data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 text-xs text-center p-4">
            <AlertCircle className="w-6 h-6 mb-1 text-stone-300" />
            <span>Forecast is based on the configured opening balance and currently available database records.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="balanceLightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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

              <Tooltip content={<CustomTooltip />} />

              {/* Minimum Cash Threshold (Safe Reserve Buffer Line) */}
              <ReferenceLine
                y={safeReserve}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Min Buffer: ${formatINR(safeReserve, { compact: true })}`,
                  fill: '#b45309',
                  fontSize: 11,
                  position: 'insideTopLeft'
                }}
              />

              {/* Break-even / Zero deficit threshold line if negative balance exists */}
              {hasNegative && (
                <ReferenceLine
                  y={0}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Deficit Line (₹0)',
                    fill: '#dc2626',
                    fontSize: 10,
                    position: 'insideBottomLeft'
                  }}
                />
              )}

              {/* Projected Balance Area */}
              <Area
                type="monotone"
                dataKey="projected_balance"
                stroke="#059669"
                strokeWidth={2.5}
                fill="url(#balanceLightGradient)"
                activeDot={{ r: 5, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend & Details */}
      <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between text-[11px] text-stone-600 gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
            Projected Cash Balance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 inline-block" />
            Minimum Cash Buffer ({formatINR(safeReserve)})
          </span>
          {hasNegative && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-rose-500 inline-block" />
              Cash Deficit (&lt; ₹0)
            </span>
          )}
        </div>

        <div className="font-mono text-stone-700">
          Period Minimum: <strong className={minProjected < 0 ? 'text-rose-700' : minProjected < safeReserve ? 'text-amber-700' : 'text-emerald-700'}>
            {formatINR(minProjected)}
          </strong>
        </div>
      </div>
    </div>
  );
}
