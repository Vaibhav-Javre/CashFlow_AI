import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { formatINR, formatDate } from '../../utils/formatters';

export default function CashFlowInsightCard({
  hasBreach = false,
  breachDate = null,
  troughBalance = null,
  safeReserve = 500000,
  timeRange = 30
}) {
  const navigate = useNavigate();

  return (
    <div
      className={`p-4 sm:p-5 rounded-xl border shadow-2xs flex flex-col justify-between transition-all ${
        hasBreach
          ? 'bg-amber-50/70 border-amber-200/90 text-amber-950'
          : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
      }`}
    >
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-current/10">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
            {hasBreach ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-900">Cash-Flow Insight</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-900">Cash-Flow Insight</span>
              </>
            )}
          </div>
          <span className="text-[10px] font-semibold opacity-70">
            {timeRange}-Day Horizon
          </span>
        </div>

        {/* Dynamic Insight Message */}
        {hasBreach ? (
          <div className="space-y-1.5">
            <p className="text-xs sm:text-sm font-semibold text-amber-950 leading-snug">
              Your projected balance may fall below your {formatINR(safeReserve)} minimum buffer {breachDate ? `around ${formatDate(breachDate, { format: 'dayMonth' })}` : 'soon'}.
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Upcoming obligations coincide within a 72-hour window while overdue customer payments remain uncollected.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs sm:text-sm font-semibold text-emerald-950 leading-snug">
              Your projected cash balance remains safely above your {formatINR(safeReserve)} minimum buffer for the next {timeRange} days.
            </p>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Expected receivables comfortably cover scheduled vendor disbursements and operating expenses.
            </p>
          </div>
        )}
      </div>

      {/* Action / Navigation & Footnote */}
      <div className="mt-4 pt-3 border-t border-current/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="text-[10px] text-stone-500 italic">
          Rule-based projection calculated from current scheduled commitments.
        </span>

        {hasBreach ? (
          <button
            onClick={() => navigate('/simulator')}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2 cursor-pointer self-start sm:self-auto"
          >
            Explore What-If actions &rarr;
          </button>
        ) : (
          <button
            onClick={() => navigate('/forecast')}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 hover:text-emerald-950 underline underline-offset-2 cursor-pointer self-start sm:self-auto"
          >
            View full forecast &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
