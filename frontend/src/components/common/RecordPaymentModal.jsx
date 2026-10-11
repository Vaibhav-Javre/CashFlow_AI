import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, ArrowDownLeft, ArrowUpRight, CreditCard, Calendar } from 'lucide-react';
import Button from './Button';
import { api } from '../../api/client';
import { formatINR } from '../../utils/formatters';

const PAYMENT_METHODS = [
  'Bank Transfer',
  'UPI',
  'Cash',
  'Card',
  'Cheque',
  'Other'
];

export default function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  item // { id, type: 'receivable' | 'payable', number, partyName, totalAmount, amountPaid, outstandingBalance }
}) {
  const isReceivable = item?.type === 'receivable';
  const outstanding = parseFloat(item?.outstandingBalance) || 0;

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen && item) {
      setError(null);
      setSuccessMsg(null);
      // Pre-fill with remaining outstanding balance
      setAmount(String(outstanding));
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('Bank Transfer');
      setReferenceNumber('');
      setNotes('');
    }
  }, [isOpen, item, outstanding]);

  if (!isOpen || !item) return null;

  const enteredAmount = parseFloat(amount) || 0;
  const remainingAfterPayment = Math.max(0, outstanding - enteredAmount);
  const isOverpaying = enteredAmount > outstanding + 0.001;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!amount || isNaN(amount) || enteredAmount <= 0) {
      setError('Please enter a valid payment amount greater than ₹0.');
      return;
    }

    if (isOverpaying) {
      setError(`Payment amount cannot exceed the remaining outstanding balance of ${formatINR(outstanding)}.`);
      return;
    }

    if (!paymentDate) {
      setError('Payment date is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        amount: enteredAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim(),
        notes: notes.trim()
      };

      if (isReceivable) {
        await api.recordCustomerPayment(item.id, payload);
        setSuccessMsg(`Payment of ${formatINR(enteredAmount)} recorded successfully!`);
      } else {
        await api.recordSupplierPayment(item.id, payload);
        setSuccessMsg(`Disbursement of ${formatINR(enteredAmount)} recorded successfully!`);
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto animate-fade-fast">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-xl p-5 my-6 max-h-[90vh] overflow-y-auto animate-pop-fast">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              isReceivable
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              {isReceivable ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                {isReceivable ? 'Record Customer Payment' : 'Record Supplier Disbursement'}
              </h3>
              <p className="text-[11px] text-stone-500">
                {item.number} &bull; {item.partyName}
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

        {/* Balance Overview Card */}
        <div className="mt-3 p-3 rounded-xl bg-[#faf8f5] border border-stone-200/80 space-y-1.5 text-xs">
          <div className="flex justify-between items-center text-stone-500">
            <span>Total {isReceivable ? 'Invoice' : 'Bill'} Amount:</span>
            <span className="font-mono font-medium text-stone-800">{formatINR(item.totalAmount)}</span>
          </div>
          <div className="flex justify-between items-center text-stone-500">
            <span>Previously Paid:</span>
            <span className="font-mono font-medium text-stone-800">{formatINR(item.amountPaid || 0)}</span>
          </div>
          <div className="flex justify-between items-center pt-1.5 border-t border-stone-200 font-semibold">
            <span className="text-stone-700">Current Outstanding:</span>
            <span className="font-mono text-stone-900">{formatINR(outstanding)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3 text-xs">
          {/* Payment Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-stone-700 font-semibold">
                Payment Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setAmount(String(outstanding))}
                className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
              >
                Full Balance ({formatINR(outstanding)})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono font-bold">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                placeholder="Enter payment amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full pl-7 pr-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-bold focus:outline-none focus:bg-white transition-all ${
                  isOverpaying ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
            </div>
            {isOverpaying && (
              <p className="text-[11px] text-rose-600 mt-1">
                Amount cannot exceed remaining balance of {formatINR(outstanding)}
              </p>
            )}
          </div>

          {/* Live Remaining Balance Preview */}
          <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
            <span className="text-stone-600">Remaining Balance After Payment:</span>
            <span className={`font-mono font-bold ${
              remainingAfterPayment <= 0.001 ? 'text-emerald-700' : 'text-stone-800'
            }`}>
              {formatINR(remainingAfterPayment)} {remainingAfterPayment <= 0.001 ? '(Fully Settled)' : '(Partial)'}
            </span>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference # */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              Reference / UTR / Check # <span className="text-stone-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. UTR-994821, CHK-8812"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              Payment Remarks <span className="text-stone-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Tranche 1 payment received via NEFT..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white resize-none"
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
              className={`${isReceivable ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'} text-white min-w-[130px]`}
            >
              {isReceivable ? 'Record Receipt' : 'Record Disbursement'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
