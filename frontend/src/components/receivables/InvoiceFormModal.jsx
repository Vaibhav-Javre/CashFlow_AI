import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, FileText, Calendar, Building2, CreditCard } from 'lucide-react';
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

export default function InvoiceFormModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceToEdit = null
}) {
  const isEditing = Boolean(invoiceToEdit);

  const initialForm = {
    invoice_number: '',
    customer_name: '',
    customer_contact: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    invoice_amount: '',
    amount_paid: '0',
    description: '',
    payment_terms: 'Net 30',
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

      if (invoiceToEdit) {
        setFormData({
          invoice_number: invoiceToEdit.invoice_number || '',
          customer_name: invoiceToEdit.customer_name || '',
          customer_contact: invoiceToEdit.customer_contact || '',
          invoice_date: (invoiceToEdit.invoice_date || '').slice(0, 10) || new Date().toISOString().split('T')[0],
          due_date: (invoiceToEdit.due_date || '').slice(0, 10) || new Date().toISOString().split('T')[0],
          invoice_amount: String(invoiceToEdit.invoice_amount || invoiceToEdit.amount || ''),
          amount_paid: String(invoiceToEdit.amount_paid || 0),
          description: invoiceToEdit.description || invoiceToEdit.notes || '',
          payment_terms: invoiceToEdit.payment_terms || 'Net 30',
          payment_method: 'Bank Transfer',
          reference_number: ''
        });
      } else {
        // Auto-generate invoice suggestion
        const randomNum = Math.floor(100 + Math.random() * 900);
        setFormData({
          ...initialForm,
          invoice_number: `INV-${new Date().getFullYear()}-${randomNum}`
        });
      }
    }
  }, [isOpen, invoiceToEdit]);

  if (!isOpen) return null;

  // Auto-calculated balance
  const invAmountNum = parseFloat(formData.invoice_amount) || 0;
  const paidAmountNum = parseFloat(formData.amount_paid) || 0;
  const calculatedOutstanding = Math.max(0, invAmountNum - paidAmountNum);

  // Derived status preview
  const getStatusPreview = () => {
    if (invAmountNum > 0 && calculatedOutstanding <= 0.001) return { label: 'Paid', color: 'emerald' };
    const today = new Date().toISOString().split('T')[0];
    if (formData.due_date < today) return { label: 'Overdue', color: 'rose' };
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    if (formData.due_date <= soon) return { label: 'Due Soon', color: 'amber' };
    return { label: 'Pending', color: 'stone' };
  };

  const statusPreview = getStatusPreview();

  const validate = () => {
    const errs = {};

    if (!formData.invoice_number.trim()) {
      errs.invoice_number = 'Invoice Number is required';
    }

    if (!formData.customer_name.trim()) {
      errs.customer_name = 'Customer Name is required';
    }

    if (!formData.invoice_amount || isNaN(formData.invoice_amount) || Number(formData.invoice_amount) <= 0) {
      errs.invoice_amount = 'Invoice Amount must be greater than ₹0';
    }

    if (isNaN(formData.amount_paid) || Number(formData.amount_paid) < 0) {
      errs.amount_paid = 'Amount Paid cannot be negative';
    } else if (Number(formData.amount_paid) > Number(formData.invoice_amount)) {
      errs.amount_paid = 'Amount Paid cannot exceed the Invoice Amount';
    }

    if (!formData.invoice_date) {
      errs.invoice_date = 'Invoice Date is required';
    }

    if (!formData.due_date) {
      errs.due_date = 'Due Date is required';
    } else if (formData.due_date < formData.invoice_date) {
      errs.due_date = 'Due Date cannot precede Invoice Date';
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submission

    if (!validate()) {
      setError('Please review the highlighted validation errors.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        invoice_number: formData.invoice_number.trim().toUpperCase(),
        customer_name: formData.customer_name.trim(),
        customer_contact: formData.customer_contact.trim(),
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        invoice_amount: parseFloat(formData.invoice_amount),
        amount_paid: parseFloat(formData.amount_paid || 0),
        description: formData.description.trim(),
        payment_terms: formData.payment_terms,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number.trim()
      };

      if (isEditing) {
        await api.updateReceivable(invoiceToEdit.id, payload);
        setSuccessMsg('Invoice updated successfully!');
      } else {
        await api.createReceivable(payload);
        setSuccessMsg('Invoice created and recorded successfully!');
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || 'Failed to save invoice record.');
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
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                {isEditing ? `Edit Invoice #${invoiceToEdit.invoice_number}` : 'Create Customer Invoice'}
              </h3>
              <p className="text-[11px] text-stone-500">
                Record receivable for goods sold or services rendered
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
          {/* Row 1: Invoice # and Customer Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Invoice Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isEditing}
                placeholder="e.g. INV-2025-101"
                value={formData.invoice_number}
                onChange={(e) => {
                  setFormData({ ...formData, invoice_number: e.target.value.toUpperCase() });
                  if (validationErrors.invoice_number) setValidationErrors({ ...validationErrors, invoice_number: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white transition-all ${
                  isEditing ? 'bg-stone-100 text-stone-500 cursor-not-allowed border-stone-200' :
                  validationErrors.invoice_number ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.invoice_number && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.invoice_number}</p>
              )}
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. HyperScale Robotics"
                value={formData.customer_name}
                onChange={(e) => {
                  setFormData({ ...formData, customer_name: e.target.value });
                  if (validationErrors.customer_name) setValidationErrors({ ...validationErrors, customer_name: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 focus:outline-none focus:bg-white transition-all ${
                  validationErrors.customer_name ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.customer_name && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.customer_name}</p>
              )}
            </div>
          </div>

          {/* Row 2: Customer Contact & Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Customer Contact <span className="text-stone-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. accounts@client.com or +91 98..."
                value={formData.customer_contact}
                onChange={(e) => setFormData({ ...formData, customer_contact: e.target.value })}
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

                  const invDate = new Date(formData.invoice_date);
                  if (!isNaN(invDate.getTime())) {
                    const newDue = new Date(invDate.getTime() + days * 86400000).toISOString().split('T')[0];
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

          {/* Row 3: Invoice Date & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Invoice Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => {
                  setFormData({ ...formData, invoice_date: e.target.value });
                  if (validationErrors.invoice_date) setValidationErrors({ ...validationErrors, invoice_date: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono focus:outline-none focus:bg-white ${
                  validationErrors.invoice_date ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.invoice_date && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.invoice_date}</p>
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
                Invoice Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="50,000.00"
                  value={formData.invoice_amount}
                  onChange={(e) => {
                    setFormData({ ...formData, invoice_amount: e.target.value });
                    if (validationErrors.invoice_amount) setValidationErrors({ ...validationErrors, invoice_amount: null });
                  }}
                  className={`w-full pl-7 pr-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white ${
                    validationErrors.invoice_amount ? 'border-rose-400' : 'border-stone-200 focus:border-emerald-600'
                  }`}
                />
              </div>
              {validationErrors.invoice_amount && (
                <p className="text-[11px] text-rose-600 mt-0.5">{validationErrors.invoice_amount}</p>
              )}
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Amount Already Paid (₹)
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

          {/* Outstanding Balance Auto-calculation Banner */}
          <div className="p-3 rounded-xl bg-[#faf8f5] border border-stone-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-stone-500 block text-[11px]">Outstanding Balance</span>
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

          {/* Optional Notes / Description */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              Description / Notes <span className="text-stone-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Batch #4 Stainless Steel wire delivery, 50% advance received..."
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
              {isEditing ? 'Save Changes' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
