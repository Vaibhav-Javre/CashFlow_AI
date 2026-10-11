import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Calendar,
  Sliders,
  ExternalLink,
  RefreshCw,
  Eye,
  Check,
  X,
  TrendingUp,
  FileText,
  HelpCircle,
  Filter,
  ArrowRight
} from 'lucide-react';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { api } from '../api/client';
import { formatINR, formatDate } from '../utils/formatters';

export default function Recommendations() {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [dismissConfirmItem, setDismissConfirmItem] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const [recsRes, sumRes] = await Promise.all([
        api.getRecommendations({ status: statusFilter, priority: priorityFilter }),
        api.getRecommendationsSummary()
      ]);

      if (recsRes && recsRes.data) {
        setRecommendations(recsRes.data);
      }
      if (sumRes && sumRes.data) {
        setSummary(sumRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [statusFilter, priorityFilter]);

  // Lock body scroll when modal is active so background doesn't shift
  useEffect(() => {
    if (activeModalItem || dismissConfirmItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeModalItem, dismissConfirmItem]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const res = await api.refreshRecommendations(30);
      if (res && res.data) {
        setRecommendations(res.data);
      }
      if (res && res.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('Failed to refresh recommendations:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      setUpdatingId(id);
      await api.updateRecommendationStatus(id, newStatus);
      await fetchRecommendations();
      if (activeModalItem && activeModalItem.id === id) {
        setActiveModalItem(null);
      }
      if (dismissConfirmItem && dismissConfirmItem.id === id) {
        setDismissConfirmItem(null);
      }
    } catch (err) {
      alert(`Error updating recommendation status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading && !recommendations.length && !summary) {
    return <LoadingSpinner message="Evaluating cash-flow rules and recommendations..." />;
  }

  // Priority badge helper
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Critical':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-600',
          cardBorder: 'border-rose-200'
        };
      case 'High':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-600',
          cardBorder: 'border-amber-200'
        };
      case 'Low':
        return {
          bg: 'bg-stone-50 text-stone-700 border-stone-200',
          dot: 'bg-stone-400',
          cardBorder: 'border-stone-200'
        };
      case 'Medium':
      default:
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-600',
          cardBorder: 'border-stone-200'
        };
    }
  };

  return (
    <div className="space-y-6 animate-fade-fast pb-12">
      {/* 1. Header & Refresh (Requirement 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-700" /> Recommended Actions
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Practical steps to improve your cash position.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={handleRefresh}
            className="text-xs"
          >
            Refresh Rules
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={Sliders}
            onClick={() => navigate('/simulator')}
            className="text-xs"
          >
            What-If Simulator
          </Button>
        </div>
      </div>

      {/* 2. Four Summary KPI Cards (Requirement 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Critical Actions */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Critical Actions</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700">
            {summary?.critical_count ?? 0}
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            Immediate cash-flow deficits requiring urgent intervention
          </p>
        </div>

        {/* Card 2: High-Priority Actions */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">High-Priority</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-800">
            {summary?.high_count ?? 0}
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            Buffer breaches, overdue debt, and timing mismatches
          </p>
        </div>

        {/* Card 3: Other Suggestions */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Other Suggestions</span>
            <Clock className="w-4 h-4 text-stone-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-stone-800">
            {summary?.other_count ?? 0}
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            Disbursement smoothing, data hygiene, and buffer monitoring
          </p>
        </div>

        {/* Card 4: Potential Cash-Flow Improvement */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Potential Improvement</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono">
            {summary?.has_calculated_improvement ? (
              <span className="text-emerald-800">+{formatINR(summary.potential_cash_flow_improvement)}</span>
            ) : (
              <span className="text-stone-500 text-sm font-semibold">Impact not estimated</span>
            )}
          </div>
          <p className="text-[11px] text-stone-500 leading-snug">
            {summary?.has_calculated_improvement
              ? "Calculated from actionable scenarios and overdue recovery"
              : "No quantifiable shortfall scenarios detected"}
          </p>
        </div>
      </div>

      {/* 3. Filters Bar (Requirement 5 & 7) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-stone-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500 font-semibold flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5" /> Filter by:
          </span>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            {[
              { id: 'active', label: 'Active' },
              { id: 'New', label: 'New' },
              { id: 'Reviewed', label: 'Reviewed' },
              { id: 'Dismissed', label: 'Dismissed' },
              { id: 'Resolved', label: 'Resolved' },
              { id: 'all', label: 'All' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-all ${
                  statusFilter === f.id
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200 ml-2">
            {[
              { id: 'all', label: 'All Priorities' },
              { id: 'Critical', label: 'Critical' },
              { id: 'High', label: 'High' },
              { id: 'Medium', label: 'Medium' },
              { id: 'Low', label: 'Low' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriorityFilter(p.id)}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-all ${
                  priorityFilter === p.id
                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs text-stone-500 font-mono">
          Showing {recommendations.length} action(s)
        </span>
      </div>

      {/* 4. Recommendation Cards (Requirement 5) */}
      {recommendations.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-2">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" />
          <h3 className="text-base font-bold text-stone-900">No Action Required</h3>
          <p className="text-xs text-stone-600 max-w-md mx-auto">
            {statusFilter === 'active'
              ? "All financial rules evaluated healthy, or active recommendations have been reviewed or resolved."
              : "No recommendations match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec) => {
            const badge = getPriorityBadge(rec.priority);
            const isDismissed = rec.status === 'Dismissed';
            const isReviewed = rec.status === 'Reviewed';
            const isResolved = rec.status === 'Resolved';

            return (
              <div
                key={rec.id}
                className={`p-5 rounded-xl bg-white border ${badge.cardBorder} shadow-2xs hover:border-stone-300 transition-all flex flex-col justify-between space-y-4 ${
                  isDismissed ? 'opacity-60 bg-stone-50/50' : ''
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Priority, Category, Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold border ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {rec.priority}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        {rec.category || 'Working Capital'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isReviewed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" /> Reviewed
                        </span>
                      )}
                      {isDismissed && (
                        <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                          Dismissed
                        </span>
                      )}
                      {isResolved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Resolved
                        </span>
                      )}
                      {!isReviewed && !isDismissed && !isResolved && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          New
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm sm:text-base font-bold text-stone-900 leading-snug">
                    {rec.title}
                  </h3>

                  {/* Explanation */}
                  <p className="text-xs text-stone-700 leading-relaxed">
                    {rec.explanation}
                  </p>

                  {/* Suggested Action Box */}
                  <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200/90 text-xs space-y-1">
                    <span className="font-bold text-stone-900 flex items-center gap-1">
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-700" /> Suggested Next Action:
                    </span>
                    <p className="text-stone-800 leading-relaxed pl-4">
                      {rec.suggested_action}
                    </p>
                  </div>

                  {/* Metrics & Dates */}
                  <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-stone-100 text-stone-600 gap-2 font-mono">
                    <div className="flex items-center gap-1.5 text-stone-500">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span>{rec.relevant_date ? formatDate(rec.relevant_date) : 'Ongoing'}</span>
                    </div>

                    <div>
                      {rec.estimated_impact > 0 ? (
                        <span className="font-bold text-emerald-800">
                          Impact: +{formatINR(rec.estimated_impact)}
                        </span>
                      ) : (
                        <span className="text-stone-400">Impact not estimated</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Eye}
                      onClick={() => setActiveModalItem(rec)}
                      className="text-xs"
                    >
                      View Details
                    </Button>

                    {rec.simulator_params && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Sliders}
                        onClick={() => navigate('/simulator')}
                        className="text-xs text-stone-700 hover:text-stone-900"
                      >
                        Simulate
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isReviewed && !isDismissed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={updatingId === rec.id}
                        onClick={() => handleUpdateStatus(rec.id, 'Reviewed')}
                        className="text-xs text-emerald-800 hover:bg-emerald-50"
                      >
                        Mark Reviewed
                      </Button>
                    )}

                    {!isDismissed ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDismissConfirmItem(rec)}
                        className="text-xs text-stone-500 hover:text-rose-600"
                      >
                        Dismiss
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={updatingId === rec.id}
                        onClick={() => handleUpdateStatus(rec.id, 'New')}
                        className="text-xs text-stone-600 hover:text-stone-900"
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Safety & Explainability Disclaimer (Requirement 10) */}
      <div className="p-4 rounded-xl bg-stone-100/70 border border-stone-200 text-xs text-stone-600 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-stone-800">
          <HelpCircle className="w-4 h-4 text-stone-500" /> Decision-Support Transparency Notice
        </div>
        <p className="leading-relaxed text-[11px]">
          All recommendations are deterministic, rule-based proposals derived from actual invoice due dates, confirmed supplier obligations, and forecasting calculations.
          The system never contacts counterparties, defers payments, or modifies financial agreements automatically. Recommendations do not constitute formal financial, legal, or audit advice.
        </p>
      </div>

      {/* 6. View Details Modal (Requirement 5) - Portalled directly to document.body */}
      {activeModalItem && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/50 backdrop-blur-xs overflow-y-auto animate-fade-fast"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModalItem(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto animate-pop-fast">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 p-5 shrink-0">
              <div className="flex items-center gap-2 pr-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${getPriorityBadge(activeModalItem.priority).bg}`}>
                  {activeModalItem.priority}
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

            {/* Scrollable Content Body */}
            <div className="space-y-3.5 text-xs p-5 overflow-y-auto">
              <div className="space-y-1">
                <strong className="text-stone-900 block font-semibold">Financial Issue & Context:</strong>
                <p className="text-stone-700 leading-relaxed">{activeModalItem.explanation}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#faf8f5] border border-stone-200 space-y-1">
                <strong className="text-stone-900 block font-semibold">Recommended Practical Action:</strong>
                <p className="text-stone-800 leading-relaxed">{activeModalItem.suggested_action}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] p-3 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <span className="text-stone-500 block">Relevant Date:</span>
                  <span className="font-bold text-stone-900">
                    {activeModalItem.relevant_date ? formatDate(activeModalItem.relevant_date) : 'Ongoing'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">Estimated Impact:</span>
                  <span className="font-bold text-emerald-800">
                    {activeModalItem.estimated_impact > 0 ? `+${formatINR(activeModalItem.estimated_impact)}` : 'Impact not estimated'}
                  </span>
                </div>
              </div>

              {activeModalItem.impact_description && (
                <p className="text-[11px] text-stone-500 italic">
                  Calculation basis: {activeModalItem.impact_description}
                </p>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {activeModalItem.related_record_type === 'receivable' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveModalItem(null);
                      navigate('/receivables');
                    }}
                    className="text-xs"
                  >
                    Open Invoices &rarr;
                  </Button>
                )}
                {activeModalItem.related_record_type === 'payable' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveModalItem(null);
                      navigate('/payables');
                    }}
                    className="text-xs"
                  >
                    Open Payables &rarr;
                  </Button>
                )}
                {activeModalItem.simulator_params && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveModalItem(null);
                      navigate('/simulator');
                    }}
                    className="text-xs"
                  >
                    Test in Simulator &rarr;
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={updatingId === activeModalItem.id}
                  onClick={() => handleUpdateStatus(activeModalItem.id, 'Reviewed')}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                >
                  Mark as Reviewed
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 7. Dismiss Confirmation Modal (Requirement 5) - Portalled directly to document.body */}
      {dismissConfirmItem && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs overflow-y-auto animate-fade-fast"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDismissConfirmItem(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full border border-stone-200 shadow-2xl overflow-hidden p-5 my-auto animate-pop-fast space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Dismiss Recommendation?
              </h3>
              <button
                type="button"
                onClick={() => setDismissConfirmItem(null)}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to dismiss "<strong>{dismissConfirmItem.title}</strong>"?
              You can restore or view dismissed actions at any time by selecting the Dismissed filter.
            </p>

            <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDismissConfirmItem(null)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                variant="danger"
                size="sm"
                loading={updatingId === dismissConfirmItem.id}
                onClick={() => handleUpdateStatus(dismissConfirmItem.id, 'Dismissed')}
                className="text-xs"
              >
                Confirm Dismiss
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
