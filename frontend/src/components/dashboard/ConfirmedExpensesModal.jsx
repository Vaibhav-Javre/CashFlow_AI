import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Zap,
  Users,
  Building,
  Wifi,
  DollarSign,
  Clock,
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { api } from '../../api/client';
import { formatINR } from '../../utils/formatters';

const DEFAULT_TEMPLATES = [
  {
    id_key: 'salary',
    title: 'Staff Salaries & Employee Payroll',
    category: 'Payroll',
    amount: '150000',
    schedule_type: 'date',
    due_date: '2026-11-01',
    due_day: 1,
    payment_status: 'Pending',
    is_active: true,
    counterparty: 'Core Engineering & Staff',
    notes: 'Scheduled for 1st of month'
  },
  {
    id_key: 'electricity',
    title: 'State Electricity & Power Utility Bill',
    category: 'Utilities',
    amount: '25000',
    schedule_type: 'monthly',
    due_day: 28,
    due_date: '',
    payment_status: 'Pending',
    is_active: true,
    counterparty: 'State Electricity Board',
    notes: 'Commercial power consumption'
  },
  {
    id_key: 'rent',
    title: 'Workshop / Office Facility Rent & Lease',
    category: 'Rent & Lease',
    amount: '50000',
    schedule_type: 'monthly',
    due_day: 30,
    due_date: '',
    payment_status: 'Pending',
    is_active: true,
    counterparty: 'Facility Landlord',
    notes: 'Monthly premises rent'
  }
];

export default function ConfirmedExpensesModal({
  isOpen,
  onClose,
  onSaved,
  onOpenOneTimeExpense
}) {
  const [activeTab, setActiveTab] = useState('fixed'); // 'fixed' or 'onetime'
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // State for One-Time Immediate Expense (e.g. ₹1,00,000 spent today buying new things)
  const [oneTimeForm, setOneTimeForm] = useState({
    title: 'Purchase of New Things for Business / Machinery',
    category: 'Equipment',
    amount: '100000',
    transaction_date: new Date().toISOString().split('T')[0],
    payment_status: 'Completed',
    counterparty: 'Industrial Equipment Vendor',
    description: 'Procurement of new equipment & operating tools for business'
  });

  // Load existing confirmed expenses from API or initialize with templates
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    api.getConfirmedExpenses()
      .then((res) => {
        if (res && res.data && res.data.length > 0) {
          const mapped = res.data.map((r) => ({
            id: r.id,
            id_key: `db_${r.id}`,
            title: r.title,
            category: r.category,
            amount: String(r.amount),
            schedule_type: r.due_date ? 'date' : 'monthly',
            due_day: r.due_day || 28,
            due_date: r.due_date || '',
            payment_status: r.payment_status || 'Pending',
            is_month_end: Boolean(r.is_month_end),
            is_active: Boolean(r.is_active),
            counterparty: r.counterparty || '',
            notes: r.notes || ''
          }));
          setExpenses(mapped);
        } else {
          setExpenses(DEFAULT_TEMPLATES);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch confirmed expenses, using defaults:', err);
        setExpenses(DEFAULT_TEMPLATES);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (index, field, value) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], [field]: value };
    setExpenses(updated);
  };

  const handleToggleActive = (index) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], is_active: !updated[index].is_active };
    setExpenses(updated);
  };

  const handleRemove = async (index) => {
    const item = expenses[index];
    if (item.id) {
      try {
        await api.deleteConfirmedExpense(item.id);
      } catch (err) {
        console.error('Failed to delete expense:', err);
      }
    }
    setExpenses(expenses.filter((_, i) => i !== index));
  };

  const handleAddCustom = () => {
    setExpenses([
      ...expenses,
      {
        id_key: `custom_${Date.now()}`,
        title: 'Scheduled Business Expense',
        category: 'Operating Expense',
        amount: '20000',
        schedule_type: 'date',
        due_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        due_day: 1,
        payment_status: 'Pending',
        is_active: true,
        counterparty: 'Service Vendor',
        notes: ''
      }
    ]);
  };

  const calculateTotal = () => {
    return expenses
      .filter((e) => e.is_active)
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  };

  // Save Confirmed Recurring & Future Scheduled Expenses
  const handleSaveFixed = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = expenses.map((e) => ({
        id: e.id,
        title: e.title.trim(),
        category: e.category,
        amount: parseFloat(e.amount) || 0,
        due_day: parseInt(e.due_day, 10) || 28,
        due_date: e.schedule_type === 'date' && e.due_date ? e.due_date : null,
        payment_status: e.payment_status || 'Pending',
        is_month_end: e.schedule_type === 'monthly' && (e.is_month_end || e.due_day >= 30),
        is_active: Boolean(e.is_active),
        counterparty: (e.counterparty || '').trim(),
        notes: (e.notes || '').trim()
      }));

      const res = await api.saveConfirmedExpenses(payload);
      if (res.success) {
        setSuccessMsg('Confirmed fixed expenses saved and scheduled successfully!');
        setTimeout(() => {
          if (onSaved) onSaved();
          onClose();
        }, 700);
      } else {
        throw new Error(res.error || 'Failed to save confirmed expenses.');
      }
    } catch (err) {
      setError(err.message || 'Error saving confirmed expenses.');
    } finally {
      setSaving(false);
    }
  };

  // Record One-Time Expense (e.g. ₹1,00,000 spent today buying new things)
  const handleSaveOneTime = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const amt = parseFloat(oneTimeForm.amount);
      if (!amt || amt <= 0) {
        throw new Error('Please enter a valid expense amount.');
      }
      if (!oneTimeForm.title.trim()) {
        throw new Error('Please enter a description for the expense.');
      }

      const txPayload = {
        title: oneTimeForm.title.trim(),
        type: 'Expense',
        category: oneTimeForm.category,
        amount: amt,
        transaction_date: oneTimeForm.transaction_date,
        due_date: oneTimeForm.transaction_date,
        payment_status: oneTimeForm.payment_status,
        counterparty: oneTimeForm.counterparty.trim() || 'Direct Vendor',
        description: oneTimeForm.description.trim() || oneTimeForm.title.trim(),
        payment_method: 'Bank Transfer'
      };

      const res = await api.createTransaction(txPayload);
      if (res.success) {
        setSuccessMsg(`Recorded expense of ${formatINR(amt)} successfully!`);
        setTimeout(() => {
          if (onSaved) onSaved();
          onClose();
        }, 700);
      } else {
        throw new Error(res.error || 'Failed to record expense.');
      }
    } catch (err) {
      setError(err.message || 'Error recording expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/70 via-white to-stone-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 tracking-tight">
                Expense Management & Commitments
              </h2>
              <p className="text-xs text-stone-500">
                Schedule future commitments (e.g. 1 Nov salaries) or record one-time business expenses
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-0 border-b border-stone-200 flex items-center gap-2 bg-stone-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('fixed')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'fixed'
                ? 'border-emerald-700 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Scheduled & Fixed Expenses (Salaries, Power, Rent)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('onetime')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'onetime'
                ? 'border-emerald-700 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Spent Today / One-Time Purchase (e.g. ₹1,00,000 for New Things)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'fixed' ? (
            /* TAB 1: SCHEDULED & FIXED EXPENSES */
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-900">Future Due Dates & Status: </span>
                  Set exact dates (e.g. <strong className="text-stone-900">1 Nov</strong> for Employee Salaries) and select status (<span className="text-amber-800 font-semibold">Pending</span>, <span className="text-emerald-800 font-semibold">Completed</span>, or <span className="text-rose-800 font-semibold">Overdue</span>). They will appear directly in your Upcoming Transactions table!
                </div>
              </div>

              {/* Expenses List */}
              <div className="space-y-3">
                {expenses.map((exp, index) => (
                  <div
                    key={exp.id_key || index}
                    className={`p-3.5 rounded-xl border transition-all ${
                      exp.is_active
                        ? 'bg-white border-stone-200 shadow-2xs hover:border-emerald-300'
                        : 'bg-stone-50/70 border-stone-200/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Top Row: Title, Category, Amount */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <input
                            type="text"
                            value={exp.title}
                            onChange={(e) => handleUpdate(index, 'title', e.target.value)}
                            placeholder="Expense title (e.g. Employee Salaries)"
                            className="w-full text-xs font-bold text-stone-900 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-emerald-500 focus:outline-hidden py-0.5 truncate"
                          />
                          <select
                            value={exp.category}
                            onChange={(e) => handleUpdate(index, 'category', e.target.value)}
                            className="text-[10px] text-stone-600 bg-stone-100 px-2 py-1 rounded border border-stone-200 focus:outline-hidden"
                          >
                            <option value="Payroll">Payroll</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Rent & Lease">Rent & Lease</option>
                            <option value="Equipment">Equipment</option>
                            <option value="Operating Expense">Operating Expense</option>
                            <option value="Inventory Purchase">Inventory Purchase</option>
                            <option value="Taxes & Compliance">Taxes & Compliance</option>
                          </select>
                        </div>

                        {/* Amount */}
                        <div className="relative w-36">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-semibold">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={exp.amount}
                            onChange={(e) => handleUpdate(index, 'amount', e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-stone-900 bg-stone-50 border border-stone-200 rounded-lg text-right focus:bg-white focus:border-emerald-500 focus:outline-hidden font-mono"
                          />
                        </div>
                      </div>

                      {/* Bottom Row: Due Date Picker & Direct Status Selector */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-stone-100 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Schedule Type (Recurring vs Specific Date) */}
                          <select
                            value={exp.schedule_type || 'monthly'}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdate(index, 'schedule_type', val);
                              if (val === 'date' && !exp.due_date) {
                                handleUpdate(index, 'due_date', '2026-11-01');
                              }
                            }}
                            className="text-[11px] text-stone-700 bg-stone-50 px-2 py-1 rounded border border-stone-200 focus:outline-hidden"
                          >
                            <option value="monthly">Every Month (Recurring)</option>
                            <option value="date">Specific Future Date</option>
                          </select>

                          {/* Date input or day selector */}
                          {exp.schedule_type === 'date' ? (
                            <input
                              type="date"
                              value={exp.due_date || ''}
                              onChange={(e) => handleUpdate(index, 'due_date', e.target.value)}
                              className="text-[11px] text-stone-800 bg-stone-50 px-2 py-1 rounded border border-emerald-300 font-mono focus:outline-hidden"
                              title="Select specific target date (e.g. 1 Nov)"
                            />
                          ) : (
                            <select
                              value={exp.is_month_end ? 'end' : exp.due_day}
                              onChange={(e) => {
                                if (e.target.value === 'end') {
                                  handleUpdate(index, 'is_month_end', true);
                                  handleUpdate(index, 'due_day', 30);
                                } else {
                                  handleUpdate(index, 'is_month_end', false);
                                  handleUpdate(index, 'due_day', parseInt(e.target.value, 10));
                                }
                              }}
                              className="text-[11px] text-stone-700 bg-stone-50 px-2 py-1 rounded border border-stone-200 focus:outline-hidden"
                            >
                              <option value="end">Month End (30/31)</option>
                              <option value="28">28th of Month</option>
                              <option value="25">25th of Month</option>
                              <option value="1">1st of Month</option>
                            </select>
                          )}

                          {/* Direct Status Selector (Pending, Completed, Overdue) */}
                          <span className="text-[10px] text-stone-400 font-medium">Status:</span>
                          <select
                            value={exp.payment_status || 'Pending'}
                            onChange={(e) => handleUpdate(index, 'payment_status', e.target.value)}
                            className={`text-[11px] font-semibold px-2 py-1 rounded border focus:outline-hidden ${
                              exp.payment_status === 'Completed'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : exp.payment_status === 'Overdue'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <option value="Pending">⏳ Pending (Scheduled)</option>
                            <option value="Completed">✅ Completed (Paid)</option>
                            <option value="Overdue">⚠️ Overdue</option>
                          </select>
                        </div>

                        {/* Actions: Pause toggle & Delete */}
                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(index)}
                            className={`text-[10px] px-2 py-1 rounded font-medium cursor-pointer border ${
                              exp.is_active
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-stone-100 text-stone-500 border-stone-200'
                            }`}
                          >
                            {exp.is_active ? 'Active' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(index)}
                            className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add custom fixed expense button */}
              <button
                type="button"
                onClick={handleAddCustom}
                className="w-full py-2.5 border-2 border-dashed border-stone-200 hover:border-emerald-500 hover:text-emerald-700 text-stone-500 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Scheduled / Fixed Expense</span>
              </button>
            </div>
          ) : (
            /* TAB 2: ONE-TIME EXPENSE (e.g. ₹1,00,000 for New Things Today) */
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                <ShoppingBag className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Record Immediate Business Spending: </span>
                  Use this to instantly record one-time outlays like purchasing equipment, tools, raw materials, or business supplies today.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Title */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    What Did You Buy / Spend On?
                  </label>
                  <input
                    type="text"
                    value={oneTimeForm.title}
                    onChange={(e) => setOneTimeForm({ ...oneTimeForm, title: e.target.value })}
                    placeholder="e.g. Bought New Tools & Equipment For Business"
                    className="w-full p-2.5 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    Amount Spent (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={oneTimeForm.amount}
                      onChange={(e) => setOneTimeForm({ ...oneTimeForm, amount: e.target.value })}
                      placeholder="100000"
                      className="w-full pl-7 pr-3 py-2.5 text-xs font-bold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden font-mono"
                    />
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    Date of Expense
                  </label>
                  <input
                    type="date"
                    value={oneTimeForm.transaction_date}
                    onChange={(e) => setOneTimeForm({ ...oneTimeForm, transaction_date: e.target.value })}
                    className="w-full p-2.5 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden font-mono"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    Category
                  </label>
                  <select
                    value={oneTimeForm.category}
                    onChange={(e) => setOneTimeForm({ ...oneTimeForm, category: e.target.value })}
                    className="w-full p-2.5 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="Equipment">Equipment & Tools</option>
                    <option value="Inventory Purchase">Inventory Purchase / Stock</option>
                    <option value="Operating Expense">Operating Expense</option>
                    <option value="Transportation">Transportation & Logistics</option>
                    <option value="Marketing">Marketing & Advertising</option>
                    <option value="Other Expense">Other Business Expense</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    Payment Status
                  </label>
                  <select
                    value={oneTimeForm.payment_status}
                    onChange={(e) => setOneTimeForm({ ...oneTimeForm, payment_status: e.target.value })}
                    className="w-full p-2.5 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="Completed">✅ Completed (Paid & Settled Today)</option>
                    <option value="Pending">⏳ Pending (To Pay Later / Bill Due)</option>
                  </select>
                </div>

                {/* Vendor / Counterparty */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-stone-700 uppercase block mb-1">
                    Vendor / Shop Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={oneTimeForm.counterparty}
                    onChange={(e) => setOneTimeForm({ ...oneTimeForm, counterparty: e.target.value })}
                    placeholder="e.g. Local Machine Tools & Hardware Store"
                    className="w-full p-2.5 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-stone-100 bg-stone-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {activeTab === 'fixed' ? (
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                Total Monthly Commitments
              </span>
              <span className="text-base font-extrabold text-stone-900 font-mono">
                {formatINR(calculateTotal())} <span className="text-xs text-stone-500 font-normal">/ month</span>
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                One-Time Outflow
              </span>
              <span className="text-base font-extrabold text-rose-700 font-mono">
                -{formatINR(parseFloat(oneTimeForm.amount) || 0)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {activeTab === 'fixed' ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveFixed}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm shadow-emerald-700/20 active:scale-98 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <span>Saving & Scheduling...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save & Schedule Commitments</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveOneTime}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-sm shadow-rose-700/20 active:scale-98 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <span>Recording Expense...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Record ₹{parseFloat(oneTimeForm.amount) || 0} Expense</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
