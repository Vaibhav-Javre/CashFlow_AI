import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Receipt, Calendar, Building2, CreditCard } from 'lucide-react';
import Button from '../common/Button';
import { api } from '../../api/client';
import { formatINR } from '../../utils/formatters';

const PAYMENT_TERMS_OPTIONS = [
  'Due on Receipt',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Custom'
];

const BILL_CATEGORIES = [
  'Supplier Payment',
  'Inventory Purchase',
  'Raw Materials',
  'Utilities',
  'Equipment',
  'Salary',
  'Transportation',
  'Marketing',
  'Other Expense'
];

const PRIORITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical (Halt Risk)' },
  { value: 'HIGH', label: 'High Priority' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'LOW', label: 'Low Priority' }
];

export default function SupplierBillFormModal({
  isOpen,
  onClose,
  onSuccess,
  billToEdit = null
}) {
  const isEditing = Boolean(billToEdit);

  const initialForm = {
    bill_number: '',
    supplier_name: '',
    supplier_contact: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    bill_amount: '',
    amount_paid: '0',
    description: '',
    payment_terms: 'Net 30',
    category: 'Supplier Payment',
    priority: 'STANDARD',
    payment_method: 'Bank Transfer',
    reference_number: ''
  };

  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setValidationErrors({});

      if (billToEdit) {
        setFormData({
          bill_number: billToEdit.bill_number || billToEdit.invoice_number || '',
          supplier_name: billToEdit.supplier_name || billToEdit.vendor_name || '',
          supplier_contact: billToEdit.supplier_contact || '',
          bill_date: (billToEdit.bill_date || '').slice(0, 10) || new Date().toISOString().split('T')[0],
          due_date: (billToEdit.due_date || '').slice(0, 10) || new Date().toISOString().split('T')[0],
          bill_amount: String(billToEdit.bill_amount || billToEdit.amount || ''),
          amount_paid: String(billToEdit.amount_paid || 0),
          description: billToEdit.description || billToEdit.notes || '',
          payment_terms: billToEdit.payment_terms || 'Net 30',
          category: billToEdit.category || 'Supplier Payment',
          priority: billToEdit.priority || 'STANDARD',
          payment_method: 'Bank Transfer',
          reference_number: ''
        });
      } else {
        const randomNum = Math.floor(100 + Math.random() * 900);
        setFormData({
          ...initialForm,
          bill_number: `BILL-${new Date().getFullYear()}-${randomNum}`
        });
      }
    }
  }, [isOpen, billToEdit]);

  if (!isOpen) return null;

  // Auto-calculated balance
  const billAmountNum = parseFloat(formData.bill_amount) || 0;
  const paidAmountNum = parseFloat(formData.amount_paid) || 0;
  const calculatedOutstanding = Math.max(0, billAmountNum - paidAmountNum);

  // Derived status preview
  const getStatusPreview = () => {
    if (billAmountNum > 0 && calculatedOutstanding <= 0.001) return { label: 'Paid', color: 'emerald' };
    const today = new Date().toISOString().split('T')[0];
    if (formData.due_date < today) return { label: 'Overdue', color: 'rose' };
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    if (formData.due_date <= soon) return { label: 'Due Soon', color: 'amber' };
    return { label: 'Pending', color: 'stone' };
  };

  const statusPreview = getStatusPreview();

  const validate = () => {
    const errs = {};

    if (!formData.bill_number.trim()) {
      errs.bill_number = 'Bill Number is required';
    }

    if (!formData.supplier_name.trim()) {
      errs.supplier_name = 'Supplier Name is required';
    }

    if (!formData.bill_amount || isNaN(formData.bill_amount) || Number(formData.bill_amount) <= 0) {
      errs.bill_amount = 'Bill Amount must be greater than ₹0';
    }

    if (isNaN(formData.amount_paid) || Number(formData.amount_paid) < 0) {
      errs.amount_paid = 'Amount Paid cannot be negative';
    } else if (Number(formData.amount_paid) > Number(formData.bill_amount)) {
      errs.amount_paid = 'Amount Paid cannot exceed the Bill Amount';
    }

    if (!formData.bill_date) {
      errs.bill_date = 'Bill Date is required';
    }

    if (!formData.due_date) {
      errs.due_date = 'Due Date is required';
    } else if (formData.due_date < formData.bill_date) {
      errs.due_date = 'Due Date cannot precede Bill Date';
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!validate()) {
      setError('Please review the highlighted validation errors.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        bill_number: formData.bill_number.trim().toUpperCase(),
        supplier_name: formData.supplier_name.trim(),
        supplier_contact: formData.supplier_contact.trim(),
        bill_date: formData.bill_date,
        due_date: formData.due_date,
        bill_amount: parseFloat(formData.bill_amount),
        amount_paid: parseFloat(formData.amount_paid || 0),
        description: formData.description.trim(),
        payment_terms: formData.payment_terms,
        category: formData.category,
        priority: formData.priority,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number.trim()
      };

      if (isEditing) {
        await api.updatePayable(billToEdit.id, payload);
        setSuccessMsg('Bill updated successfully!');
      } else {
        await api.createPayable(payload);
        setSuccessMsg('Supplier bill recorded successfully!');
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || 'Failed to save bill record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto animate-fade-fast">
      <div className="w-full max-w-lg bg-white border border-stone-200 rounded-2xl shadow-xl p-5 my-6 max-h-[92vh] overflow-y-auto animate-pop-fast">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                {isEditing ? `Edit Bill #${billToEdit.bill_number || billToEdit.invoice_number}` : 'Record Supplier Bill'}
              </h3>
              <p className="text-[11px] text-stone-500">
                Record payable obligation for vendor supplies or services
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-3 space-y-3.5 text-xs">
          {/* Row 1: Bill # and Supplier Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Bill / PO Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isEditing}
                placeholder="e.g. PO-VULCAN-881"
                value={formData.bill_number}
                onChange={(e) => {
                  setFormData({ ...formData, bill_number: e.target.value.toUpperCase() });
                  if (validationErrors.bill_number) setValidationErrors({ ...validationErrors, bill_number: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white transition-all ${
                  isEditing ? 'bg-stone-100 text-stone-500 cursor-not-allowed border-stone-200' :
                  validationErrors.bill_number ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.bill_number && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.bill_number}</p>
              )}
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Supplier Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Vulcan Alloy Suppliers"
                value={formData.supplier_name}
                onChange={(e) => {
                  setFormData({ ...formData, supplier_name: e.target.value });
                  if (validationErrors.supplier_name) setValidationErrors({ ...validationErrors, supplier_name: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 focus:outline-none focus:bg-white transition-all ${
                  validationErrors.supplier_name ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.supplier_name && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.supplier_name}</p>
              )}
            </div>
          </div>

          {/* Row 2: Supplier Contact & Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Supplier Contact <span className="text-stone-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. billing@supplier.com or phone"
                value={formData.supplier_contact}
                onChange={(e) => setFormData({ ...formData, supplier_contact: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Payment Terms
              </label>
              <select
                value={formData.payment_terms}
                onChange={(e) => {
                  const term = e.target.value;
                  let days = 30;
                  if (term === 'Due on Receipt') days = 0;
                  else if (term === 'Net 15') days = 15;
                  else if (term === 'Net 30') days = 30;
                  else if (term === 'Net 45') days = 45;
                  else if (term === 'Net 60') days = 60;

                  const bDate = new Date(formData.bill_date);
                  if (!isNaN(bDate.getTime())) {
                    const newDue = new Date(bDate.getTime() + days * 86400000).toISOString().split('T')[0];
                    setFormData({ ...formData, payment_terms: term, due_date: newDue });
                  } else {
                    setFormData({ ...formData, payment_terms: term });
                  }
                }}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Bill Date & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Bill Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.bill_date}
                onChange={(e) => {
                  setFormData({ ...formData, bill_date: e.target.value });
                  if (validationErrors.bill_date) setValidationErrors({ ...validationErrors, bill_date: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono focus:outline-none focus:bg-white ${
                  validationErrors.bill_date ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.bill_date && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.bill_date}</p>
              )}
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => {
                  setFormData({ ...formData, due_date: e.target.value });
                  if (validationErrors.due_date) setValidationErrors({ ...validationErrors, due_date: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono focus:outline-none focus:bg-white ${
                  validationErrors.due_date ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.due_date && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.due_date}</p>
              )}
            </div>
          </div>

          {/* Row 4: Amounts & Calculated Outstanding */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Bill Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="30,000.00"
                  value={formData.bill_amount}
                  onChange={(e) => {
                    setFormData({ ...formData, bill_amount: e.target.value });
                    if (validationErrors.bill_amount) setValidationErrors({ ...validationErrors, bill_amount: null });
                  }}
                  className={`w-full pl-7 pr-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white ${
                    validationErrors.bill_amount ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                  }`}
                />
              </div>
              {validationErrors.bill_amount && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.bill_amount}</p>
              )}
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Amount Already Disbursed (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isEditing}
                  placeholder="0.00"
                  value={formData.amount_paid}
                  onChange={(e) => {
                    setFormData({ ...formData, amount_paid: e.target.value });
                    if (validationErrors.amount_paid) setValidationErrors({ ...validationErrors, amount_paid: null });
                  }}
                  className={`w-full pl-7 pr-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white ${
                    isEditing ? 'bg-stone-100 text-stone-500 cursor-not-allowed border-stone-200' :
                    validationErrors.amount_paid ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                  }`}
                />
              </div>
              {validationErrors.amount_paid && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.amount_paid}</p>
              )}
            </div>
          </div>

          {/* Row 5: Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                {BILL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">Disbursement Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Outstanding Balance Auto-calculation Banner */}
          <div className="p-3 rounded-xl bg-[#faf8f5] border border-stone-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-stone-500 block text-[11px]">Outstanding Obligation</span>
              <span className="font-mono font-bold text-sm text-stone-900">
                {formatINR(calculatedOutstanding)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-stone-500 block text-[11px]">Calculated Status</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                statusPreview.color === 'emerald'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusPreview.color === 'rose'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : statusPreview.color === 'amber'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-stone-100 text-stone-700 border-stone-200'
              }`}>
                {statusPreview.label}
              </span>
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              Description / Notes <span className="text-stone-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Critical Titanium billets for production line..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={loading}
              className="bg-emerald-700 hover:bg-emerald-800 text-white min-w-[120px]"
            >
              {isEditing ? 'Save Changes' : 'Record Bill'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
