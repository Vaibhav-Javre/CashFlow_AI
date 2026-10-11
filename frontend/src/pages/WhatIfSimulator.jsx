import React, { useState, useEffect } from 'react';
import {
  Sliders,
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
  Save,
  Copy,
  Trash2,
  Calendar,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Edit2,
  Info,
  HelpCircle,
  FolderOpen
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { api } from '../api/client';
import { formatINR, formatINRAxis, formatDate } from '../utils/formatters';

export default function WhatIfSimulator() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [currentScenarioId, setCurrentScenarioId] = useState(null);
  const [currentScenarioName, setCurrentScenarioName] = useState('Unsaved Scenario');
  const [currentScenarioDesc, setCurrentScenarioDesc] = useState('');

  // Active adjustments in current draft
  const [adjustments, setAdjustments] = useState([]);

  // Database options for adjustment dropdowns
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);

  // Modals state
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [editingAdjIndex, setEditingAdjIndex] = useState(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [saveDescInput, setSaveDescInput] = useState('');

  // Form state for adjustment modal
  const [adjForm, setAdjForm] = useState({
    adjustment_type: 'customer_payment',
    related_record_id: '',
    hypothetical_date: new Date().toISOString().slice(0, 10),
    hypothetical_amount: '',
    description: '',
    original_date: '',
    original_amount: 0
  });

  // 1. Initial Data Fetching
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [scensRes, recsRes, payRes] = await Promise.all([
        api.getScenarios().catch(() => ({ data: [] })),
        api.getReceivables().catch(() => ({ data: [] })),
        api.getPayables().catch(() => ({ data: [] }))
      ]);

      setSavedScenarios(scensRes?.data || []);
      setReceivables(recsRes?.data || []);
      setPayables(payRes?.data || []);

      // Calculate baseline preview with 0 adjustments
      const previewRes = await api.previewScenario([], days);
      setComparison(previewRes?.data || null);
    } catch (err) {
      console.error('Failed to load initial simulator data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // 2. Recalculate scenario when adjustments or horizon change
  const recalculate = async (targetAdjustments = adjustments, targetDays = days) => {
    try {
      setCalculating(true);
      const res = await api.previewScenario(targetAdjustments, targetDays);
      if (res && res.data) {
        setComparison(res.data);
      }
    } catch (err) {
      console.error('Calculation error:', err);
      alert(`Calculation error: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  const handleDaysChange = (newDays) => {
    setDays(newDays);
    recalculate(adjustments, newDays);
  };

  // 3. Scenario Selection / Loading
  const handleSelectScenario = async (scenId) => {
    if (!scenId) {
      // Reset to empty draft
      setCurrentScenarioId(null);
      setCurrentScenarioName('Unsaved Scenario');
      setCurrentScenarioDesc('');
      setAdjustments([]);
      recalculate([], days);
      return;
    }

    try {
      setCalculating(true);
      const res = await api.getScenario(scenId);
      if (res && res.data) {
        const scen = res.data;
        setCurrentScenarioId(scen.id);
        setCurrentScenarioName(scen.name);
        setCurrentScenarioDesc(scen.description || '');
        setAdjustments(scen.adjustments || []);
        recalculate(scen.adjustments || [], days);
      }
    } catch (err) {
      alert(`Failed to load scenario: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // 4. Save / Update Scenario
  const handleOpenSaveModal = () => {
    setSaveNameInput(currentScenarioId ? currentScenarioName : '');
    setSaveDescInput(currentScenarioDesc || '');
    setIsSaveModalOpen(true);
  };

  const handleSaveScenario = async () => {
    if (!saveNameInput.trim()) {
      alert('Please enter a scenario name.');
      return;
    }

    try {
      setCalculating(true);
      let res;
      if (currentScenarioId) {
        // Update existing
        res = await api.updateScenario(currentScenarioId, {
          name: saveNameInput.trim(),
          description: saveDescInput.trim(),
          adjustments
        });
      } else {
        // Create new
        res = await api.createScenario({
          name: saveNameInput.trim(),
          description: saveDescInput.trim(),
          adjustments
        });
      }

      if (res && res.data) {
        setCurrentScenarioId(res.data.id);
        setCurrentScenarioName(res.data.name);
        setCurrentScenarioDesc(res.data.description || '');
        setIsSaveModalOpen(false);

        // Refresh saved scenarios dropdown
        const scensRes = await api.getScenarios();
        setSavedScenarios(scensRes?.data || []);
      }
    } catch (err) {
      alert(`Failed to save scenario: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // 5. Duplicate Scenario
  const handleDuplicateScenario = async () => {
    if (!currentScenarioId) {
      alert('Please save the scenario first before duplicating.');
      return;
    }

    try {
      setCalculating(true);
      const res = await api.duplicateScenario(currentScenarioId);
      if (res && res.data) {
        setCurrentScenarioId(res.data.id);
        setCurrentScenarioName(res.data.name);
        setCurrentScenarioDesc(res.data.description || '');
        setAdjustments(res.data.adjustments || []);

        const scensRes = await api.getScenarios();
        setSavedScenarios(scensRes?.data || []);
        recalculate(res.data.adjustments || [], days);
      }
    } catch (err) {
      alert(`Failed to duplicate scenario: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // 6. Delete Scenario
  const handleDeleteScenario = async () => {
    if (!currentScenarioId) return;

    try {
      setCalculating(true);
      await api.deleteScenario(currentScenarioId);
      setIsDeleteModalOpen(false);

      // Reset to empty draft
      setCurrentScenarioId(null);
      setCurrentScenarioName('Unsaved Scenario');
      setCurrentScenarioDesc('');
      setAdjustments([]);

      const scensRes = await api.getScenarios();
      setSavedScenarios(scensRes?.data || []);
      recalculate([], days);
    } catch (err) {
      alert(`Failed to delete scenario: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // 7. Reset to Baseline
  const handleResetBaseline = () => {
    setCurrentScenarioId(null);
    setCurrentScenarioName('Unsaved Scenario');
    setCurrentScenarioDesc('');
    setAdjustments([]);
    recalculate([], days);
  };

  // 8. Adjustment Modal Open & Form Management
  const handleOpenAddAdjustment = () => {
    setEditingAdjIndex(null);
    const defaultDate = new Date().toISOString().slice(0, 10);
    setAdjForm({
      adjustment_type: 'customer_payment',
      related_record_id: receivables.length > 0 ? receivables[0].id : '',
      hypothetical_date: receivables.length > 0 ? (receivables[0].expected_payment_date || receivables[0].due_date) : defaultDate,
      hypothetical_amount: receivables.length > 0 ? receivables[0].amount : '',
      description: '',
      original_date: receivables.length > 0 ? (receivables[0].expected_payment_date || receivables[0].due_date) : defaultDate,
      original_amount: receivables.length > 0 ? receivables[0].amount : 0
    });
    setIsAdjModalOpen(true);
  };

  const handleOpenEditAdjustment = (idx) => {
    const adj = adjustments[idx];
    setEditingAdjIndex(idx);
    setAdjForm({
      adjustment_type: adj.adjustment_type,
      related_record_id: adj.related_record_id || '',
      hypothetical_date: adj.hypothetical_date,
      hypothetical_amount: adj.hypothetical_amount,
      description: adj.description || '',
      original_date: adj.original_date || '',
      original_amount: adj.original_amount || 0
    });
    setIsAdjModalOpen(true);
  };

  const handleSelectRecordInForm = (type, id) => {
    if (type === 'customer_payment') {
      const rec = receivables.find((r) => String(r.id) === String(id));
      if (rec) {
        const origDate = rec.expected_payment_date || rec.due_date;
        setAdjForm((prev) => ({
          ...prev,
          related_record_id: rec.id,
          original_date: origDate,
          original_amount: rec.amount,
          hypothetical_date: prev.hypothetical_date || origDate,
          hypothetical_amount: prev.hypothetical_amount !== '' ? prev.hypothetical_amount : rec.amount
        }));
      }
    } else if (type === 'supplier_payment') {
      const pay = payables.find((p) => String(p.id) === String(id));
      if (pay) {
        const origDate = pay.due_date;
        setAdjForm((prev) => ({
          ...prev,
          related_record_id: pay.id,
          original_date: origDate,
          original_amount: pay.amount,
          hypothetical_date: prev.hypothetical_date || origDate,
          hypothetical_amount: prev.hypothetical_amount !== '' ? prev.hypothetical_amount : pay.amount
        }));
      }
    }
  };

  const handleSaveAdjustmentForm = () => {
    const amt = parseFloat(adjForm.hypothetical_amount);
    if (isNaN(amt) || amt < 0) {
      alert('Please enter a valid, non-negative hypothetical amount.');
      return;
    }
    if (!adjForm.hypothetical_date) {
      alert('Please select a valid hypothetical date.');
      return;
    }

    let adjObj = {
      adjustment_type: adjForm.adjustment_type,
      hypothetical_date: adjForm.hypothetical_date,
      hypothetical_amount: amt,
      description: adjForm.description.trim()
    };

    if (adjForm.adjustment_type === 'customer_payment') {
      const rec = receivables.find((r) => String(r.id) === String(adjForm.related_record_id));
      adjObj.related_record_type = 'receivable';
      adjObj.related_record_id = rec ? rec.id : parseInt(adjForm.related_record_id, 10);
      adjObj.original_date = adjForm.original_date;
      adjObj.original_amount = adjForm.original_amount;
      if (!adjObj.description && rec) {
        adjObj.description = `Adjusted payment for ${rec.invoice_number} (${rec.customer_name})`;
      }
    } else if (adjForm.adjustment_type === 'supplier_payment') {
      const pay = payables.find((p) => String(p.id) === String(adjForm.related_record_id));
      adjObj.related_record_type = 'payable';
      adjObj.related_record_id = pay ? pay.id : parseInt(adjForm.related_record_id, 10);
      adjObj.original_date = adjForm.original_date;
      adjObj.original_amount = adjForm.original_amount;
      if (!adjObj.description && pay) {
        adjObj.description = `Adjusted disbursement for ${pay.bill_number || pay.id} (${pay.supplier_name})`;
      }
    } else if (adjForm.adjustment_type === 'new_income') {
      if (!adjObj.description) {
        adjObj.description = 'Hypothetical Additional Income';
      }
    } else if (adjForm.adjustment_type === 'new_expense') {
      if (!adjObj.description) {
        adjObj.description = 'Hypothetical Business Expense';
      }
    }

    let updatedAdjs = [...adjustments];
    if (editingAdjIndex !== null) {
      updatedAdjs[editingAdjIndex] = adjObj;
    } else {
      updatedAdjs.push(adjObj);
    }

    setAdjustments(updatedAdjs);
    setIsAdjModalOpen(false);
    recalculate(updatedAdjs, days);
  };

  const handleDeleteAdjustment = (idx) => {
    const updated = adjustments.filter((_, i) => i !== idx);
    setAdjustments(updated);
    recalculate(updated, days);
  };

  if (loading) {
    return <LoadingSpinner message="Initializing What-If simulator engine & financial records..." />;
  }

  // Derive comparison metrics safely
  const cmp = comparison?.comparison || {};
  const timeline = comparison?.timeline || [];
  const minBuffer = comparison?.minimum_cash_buffer || 500000;

  // Custom Chart Tooltip
  const CustomChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0].payload;
    const baseBal = pt.baseline_balance ?? 0;
    const scenBal = pt.scenario_balance ?? 0;
    const delta = pt.balance_delta ?? (scenBal - baseBal);

    return (
      <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-lg text-xs space-y-2 min-w-[240px]">
        <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
          <span className="font-semibold text-stone-800">{formatDate(label, { format: 'full' })}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            pt.is_scenario_negative
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : pt.is_scenario_below_buffer
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}>
            {pt.is_scenario_negative ? 'Negative' : pt.is_scenario_below_buffer ? 'Below Buffer' : 'Safe'}
          </span>
        </div>

        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between text-stone-600">
            <span>Baseline Projected:</span>
            <span className="font-semibold text-stone-800">{formatINR(baseBal)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-stone-900">Scenario Projected:</span>
            <span className={scenBal < 0 ? 'text-rose-700' : scenBal < minBuffer ? 'text-amber-800' : 'text-emerald-700'}>
              {formatINR(scenBal)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-stone-100">
            <span>Net Impact (Delta):</span>
            <span className={`font-bold ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-stone-600'}`}>
              {delta > 0 ? '+' : ''}{formatINR(delta)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-fast pb-16">
      {/* 1. Page Header (Requirement 8.1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-emerald-700" /> What-If Simulator
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Test business decisions, payment shifts, and new expenses before executing them.
          </p>
        </div>

        {/* Horizon switcher (7, 30, 60 days) */}
        <div className="flex items-center gap-1.5 bg-stone-100/90 p-1 rounded-xl border border-stone-200 self-start sm:self-auto">
          {[7, 30, 60].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDaysChange(d)}
              disabled={calculating}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                days === d
                  ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* 2. Scenario Management Bar (Requirement 5 & 8.2) */}
      <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <FolderOpen className="w-4 h-4 text-stone-500 shrink-0" />
          <div className="flex-1 max-w-xs">
            <select
              value={currentScenarioId || ''}
              onChange={(e) => handleSelectScenario(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full text-xs font-semibold bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-900 focus:outline-emerald-600"
            >
              <option value="">-- Active Draft ({adjustments.length} adjustment{adjustments.length === 1 ? '' : 's'}) --</option>
              {savedScenarios.map((scen) => (
                <option key={scen.id} value={scen.id}>
                  {scen.name} ({scen.adjustments_count} adj)
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:block text-xs text-stone-600">
            <span className="font-bold text-stone-800">{currentScenarioName}</span>
            {currentScenarioDesc && <span className="text-stone-500 ml-1.5">({currentScenarioDesc})</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={handleOpenAddAdjustment}
            className="bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs"
          >
            Add Adjustment
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={Save}
            onClick={handleOpenSaveModal}
            className="text-xs"
          >
            {currentScenarioId ? 'Update Scenario' : 'Save Scenario'}
          </Button>

          {currentScenarioId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={Copy}
                onClick={handleDuplicateScenario}
                className="text-xs text-stone-600 hover:text-stone-900"
              >
                Duplicate
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setIsDeleteModalOpen(true)}
                className="text-xs text-rose-600 hover:bg-rose-50"
              >
                Delete
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={handleResetBaseline}
            className="text-xs text-stone-500 hover:text-stone-900"
          >
            Reset
          </Button>
        </div>
      </div>

      {/* 3. Baseline vs. Scenario Comparison Cards (Requirement 3 & 8.4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ending Cash Balance */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span>Projected Ending Cash</span>
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-bold font-mono text-stone-900">
              {formatINR(cmp.projected_ending_cash?.scenario)}
            </span>
            <span className={`text-xs font-bold font-mono ${
              cmp.projected_ending_cash?.delta > 0
                ? 'text-emerald-700'
                : cmp.projected_ending_cash?.delta < 0
                  ? 'text-rose-700'
                  : 'text-stone-500'
            }`}>
              {cmp.projected_ending_cash?.delta > 0 ? '+' : ''}
              {formatINR(cmp.projected_ending_cash?.delta)}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-stone-500 font-mono pt-1 border-t border-stone-100">
            <span>Baseline: {formatINR(cmp.projected_ending_cash?.baseline)}</span>
            <span>{cmp.projected_ending_cash?.improved ? 'Improved' : 'Unchanged/Lower'}</span>
          </div>
        </div>

        {/* Card 2: Lowest Projected Balance */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span>Lowest Projected Low</span>
            <TrendingDown className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-xl sm:text-2xl font-bold font-mono ${
              cmp.lowest_projected_balance?.scenario < 0
                ? 'text-rose-700'
                : cmp.lowest_projected_balance?.scenario < minBuffer
                  ? 'text-amber-800'
                  : 'text-emerald-700'
            }`}>
              {formatINR(cmp.lowest_projected_balance?.scenario)}
            </span>
            <span className={`text-xs font-bold font-mono ${
              cmp.lowest_projected_balance?.delta > 0
                ? 'text-emerald-700'
                : cmp.lowest_projected_balance?.delta < 0
                  ? 'text-rose-700'
                  : 'text-stone-500'
            }`}>
              {cmp.lowest_projected_balance?.delta > 0 ? '+' : ''}
              {formatINR(cmp.lowest_projected_balance?.delta)}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-stone-500 font-mono pt-1 border-t border-stone-100">
            <span>Baseline: {formatINR(cmp.lowest_projected_balance?.baseline)}</span>
            <span>Trough: {formatDate(cmp.lowest_projected_balance?.scenario_trough_date)}</span>
          </div>
        </div>

        {/* Card 3: Potential Cash Shortfall */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span>Potential Shortfall</span>
            <Clock className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-xl sm:text-2xl font-bold font-mono ${
              cmp.potential_shortfall?.scenario > 0 ? 'text-rose-700' : 'text-stone-900'
            }`}>
              {formatINR(cmp.potential_shortfall?.scenario)}
            </span>
            <span className={`text-xs font-bold font-mono ${
              cmp.potential_shortfall?.delta < 0
                ? 'text-emerald-700'
                : cmp.potential_shortfall?.delta > 0
                  ? 'text-rose-700'
                  : 'text-stone-500'
            }`}>
              {cmp.potential_shortfall?.delta < 0 ? '-' : cmp.potential_shortfall?.delta > 0 ? '+' : ''}
              {formatINR(Math.abs(cmp.potential_shortfall?.delta || 0))}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-stone-500 font-mono pt-1 border-t border-stone-100">
            <span>Buffer: {formatINR(minBuffer)}</span>
            <span>{cmp.potential_shortfall?.improved ? 'Shortfall Reduced' : 'Buffer Gap'}</span>
          </div>
        </div>

        {/* Card 4: Overall Risk Level */}
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span>Overall Risk Status</span>
            {cmp.overall_risk?.scenario === 'Healthy' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            )}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
              cmp.overall_risk?.scenario === 'Critical'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : cmp.overall_risk?.scenario === 'High'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : cmp.overall_risk?.scenario === 'Moderate'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {cmp.overall_risk?.scenario || 'Healthy'}
            </span>
            {cmp.overall_risk?.scenario !== cmp.overall_risk?.baseline && (
              <span className="text-[11px] font-bold text-stone-500">
                (was {cmp.overall_risk?.baseline})
              </span>
            )}
          </div>
          <div className="text-[11px] text-stone-500 leading-snug pt-1">
            First Risk Date: <strong className="text-stone-800">{cmp.first_risk_date?.scenario}</strong>
          </div>
        </div>
      </div>

      {/* 4. Interactive Forecast Visualization Chart (Requirement 4 & 8.5) */}
      <div className="p-5 sm:p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-700" />
              Cash Position Trajectory: Baseline vs. Scenario ({days} Days)
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Dual projected cash curves comparing current baseline trajectory with hypothetical adjustments
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-stone-600">
              <span className="w-3.5 h-0.5 bg-stone-400 border-dashed inline-block" />
              Baseline Forecast
            </span>
            <span className="flex items-center gap-1.5 text-emerald-800">
              <span className="w-3.5 h-1 bg-emerald-600 inline-block rounded-full" />
              Scenario Forecast
            </span>
          </div>
        </div>

        <div className="h-72 w-full relative">
          {calculating && (
            <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-2xs flex items-center justify-center">
              <span className="text-xs font-semibold text-stone-600 animate-pulse">
                Recalculating dual cash projections...
              </span>
            </div>
          )}

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
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
              <Tooltip content={<CustomChartTooltip />} />

              {/* Minimum buffer threshold */}
              <ReferenceLine
                y={minBuffer}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Min Buffer: ${formatINR(minBuffer, { compact: true })}`,
                  fill: '#b45309',
                  fontSize: 10,
                  position: 'insideTopLeft'
                }}
              />

              {/* Deficit line if negative */}
              <ReferenceLine
                y={0}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{
                  value: '₹0 Deficit Line',
                  fill: '#dc2626',
                  fontSize: 10,
                  position: 'insideBottomLeft'
                }}
              />

              {/* Baseline curve (dashed grey) */}
              <Line
                type="monotone"
                dataKey="baseline_balance"
                stroke="#78716c"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
              />

              {/* Scenario curve (solid emerald/rose) */}
              <Line
                type="monotone"
                dataKey="scenario_balance"
                stroke={cmp.lowest_projected_balance?.scenario < 0 ? "#e11d48" : "#059669"}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "#059669", stroke: "#ffffff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between text-xs text-stone-500 gap-2 font-mono">
          <span>Net Liquidity Gain across {days} days: <strong className="text-emerald-800 font-bold">{formatINR(cmp.net_movement?.delta || 0)}</strong></span>
          <span className="italic">{comparison?.disclaimer}</span>
        </div>
      </div>

      {/* 5. Adjustment Summary Table & Builder (Requirement 2 & 8.6) */}
      <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-stone-700" />
              Hypothetical Adjustments ({adjustments.length})
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Specific payment date shifts, partial collections, and one-time expenses simulated in this scenario
            </p>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={handleOpenAddAdjustment}
            className="text-xs"
          >
            Add Adjustment
          </Button>
        </div>

        {adjustments.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 space-y-2">
            <Sliders className="w-6 h-6 mx-auto text-stone-400" />
            <h4 className="text-xs font-bold text-stone-800">No Adjustments in Current Scenario</h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Your scenario currently matches the baseline forecast. Add an adjustment to test what happens if a customer pays earlier, a vendor bill is staggered, or an expense occurs.
            </p>
            <div className="pt-2">
              <Button
                size="sm"
                variant="primary"
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                onClick={handleOpenAddAdjustment}
              >
                + Add First Adjustment
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Description & Ref</th>
                  <th className="py-2.5 px-3">Original Schedule</th>
                  <th className="py-2.5 px-3">Hypothetical Change</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {adjustments.map((adj, idx) => {
                  const isRec = adj.adjustment_type === 'customer_payment';
                  const isPay = adj.adjustment_type === 'supplier_payment';
                  const isInc = adj.adjustment_type === 'new_income';
                  const isExp = adj.adjustment_type === 'new_expense';

                  return (
                    <tr key={idx} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isRec
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : isPay
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : isInc
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          {adj.adjustment_type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{adj.description || 'Adjustment'}</div>
                        {adj.related_record_id && (
                          <div className="text-[11px] text-stone-500 font-mono">
                            ID #{adj.related_record_id} ({adj.related_record_type})
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-stone-600">
                        {adj.original_date ? (
                          <div>
                            <span>{formatDate(adj.original_date)}</span>
                            <span className="text-stone-400 block text-[11px]">{formatINR(adj.original_amount)}</span>
                          </div>
                        ) : (
                          <span className="text-stone-400 italic">None (New)</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-stone-900">{formatDate(adj.hypothetical_date)}</div>
                        <div className={`text-[11px] font-bold ${isRec || isInc ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isRec || isInc ? '+' : '-'}{formatINR(adj.hypothetical_amount)}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAdjustment(idx)}
                            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md cursor-pointer"
                            title="Edit adjustment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdjustment(idx)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                            title="Remove adjustment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Modal: Add/Edit Adjustment (Requirement 2) */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-2xs animate-fade-fast">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-xl overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-700" />
                {editingAdjIndex !== null ? 'Edit Adjustment' : 'Add Hypothetical Adjustment'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAdjModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
              {[
                { id: 'customer_payment', label: 'Customer Pay' },
                { id: 'supplier_payment', label: 'Supplier Pay' },
                { id: 'new_income', label: 'New Income' },
                { id: 'new_expense', label: 'New Expense' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setAdjForm((prev) => ({
                      ...prev,
                      adjustment_type: t.id,
                      description: ''
                    }));
                    if (t.id === 'customer_payment' && receivables.length > 0) {
                      handleSelectRecordInForm('customer_payment', receivables[0].id);
                    } else if (t.id === 'supplier_payment' && payables.length > 0) {
                      handleSelectRecordInForm('supplier_payment', payables[0].id);
                    }
                  }}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    adjForm.adjustment_type === t.id
                      ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 text-xs">
              {/* Linked Record selector for Customer Payment */}
              {adjForm.adjustment_type === 'customer_payment' && (
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700 block">Select Open Customer Invoice:</label>
                  <select
                    value={adjForm.related_record_id}
                    onChange={(e) => handleSelectRecordInForm('customer_payment', e.target.value)}
                    className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900"
                  >
                    {receivables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.invoice_number} — {r.customer_name} (₹{r.amount.toLocaleString('en-IN')}) Due: {r.expected_payment_date || r.due_date}
                      </option>
                    ))}
                  </select>
                  {adjForm.original_date && (
                    <div className="text-[11px] text-stone-500 font-mono">
                      Original Expected Date: {formatDate(adjForm.original_date)} | Amount: {formatINR(adjForm.original_amount)}
                    </div>
                  )}
                </div>
              )}

              {/* Linked Record selector for Supplier Payment */}
              {adjForm.adjustment_type === 'supplier_payment' && (
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700 block">Select Open Supplier Bill:</label>
                  <select
                    value={adjForm.related_record_id}
                    onChange={(e) => handleSelectRecordInForm('supplier_payment', e.target.value)}
                    className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900"
                  >
                    {payables.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bill_number || p.id} — {p.supplier_name} (₹{p.amount.toLocaleString('en-IN')}) Due: {p.due_date}
                      </option>
                    ))}
                  </select>
                  {adjForm.original_date && (
                    <div className="text-[11px] text-stone-500 font-mono">
                      Original Due Date: {formatDate(adjForm.original_date)} | Amount: {formatINR(adjForm.original_amount)}
                    </div>
                  )}
                </div>
              )}

              {/* Hypothetical Date */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700 block">Hypothetical Expected Date:</label>
                <input
                  type="date"
                  value={adjForm.hypothetical_date}
                  onChange={(e) => setAdjForm({ ...adjForm, hypothetical_date: e.target.value })}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-mono"
                />
                <p className="text-[11px] text-stone-500">
                  {adjForm.adjustment_type === 'customer_payment'
                    ? "Simulate customer paying earlier (prompt settlement) or later."
                    : adjForm.adjustment_type === 'supplier_payment'
                      ? "Simulate paying vendor earlier or staggering to a later date."
                      : "Date when hypothetical cash movement occurs."}
                </p>
              </div>

              {/* Hypothetical Amount */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700 block">Hypothetical Amount (₹):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adjForm.hypothetical_amount}
                  onChange={(e) => setAdjForm({ ...adjForm, hypothetical_amount: e.target.value })}
                  placeholder="e.g. 50000"
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-mono"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700 block">Description (Optional):</label>
                <input
                  type="text"
                  value={adjForm.description}
                  onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
                  placeholder="e.g. 50% advance collection or emergency repair"
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsAdjModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                onClick={handleSaveAdjustmentForm}
              >
                Apply to Scenario
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Save Scenario (Requirement 5) */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-2xs animate-fade-fast">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-stone-200 shadow-xl overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Save className="w-4 h-4 text-emerald-700" /> Save Scenario
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-stone-700 block">Scenario Name:</label>
                <input
                  type="text"
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  placeholder="e.g. Q4 Vendor Stagger & Early Discount"
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-stone-700 block">Description (Optional):</label>
                <textarea
                  rows="2"
                  value={saveDescInput}
                  onChange={(e) => setSaveDescInput(e.target.value)}
                  placeholder="Notes on hypothetical assumptions..."
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-900"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="sm"
                loading={calculating}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                onClick={handleSaveScenario}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Delete Scenario Confirmation */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-2xs animate-fade-fast">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-stone-200 shadow-xl overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Delete Scenario?
              </h3>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to permanently delete saved scenario "<strong>{currentScenarioName}</strong>"? This action cannot be undone.
            </p>

            <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                variant="danger"
                size="sm"
                loading={calculating}
                onClick={handleDeleteScenario}
                className="text-xs"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
