import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import Button from '../common/Button';
import { formatINR, formatDate } from '../../utils/formatters';

export default function DeleteConfirmDialog({
  isOpen,
  transaction,
  onClose,
  onConfirm,
  loading = false
}) {
  if (!isOpen || !transaction) return null;

  const isIncome = transaction.type === 'Income' || transaction.type === 'INFLOW';
  const displayTitle = transaction.title || transaction.description || 'Untitled Transaction';
  const displayAmount = formatINR(transaction.amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs animate-fade-fast">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-xl p-5 animate-pop-fast">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Delete Transaction</h3>
              <p className="text-[11px] text-stone-500">This action will remove the record from your ledger.</p>
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

        {/* Content Body */}
        <div className="my-4 p-3 rounded-xl bg-[#faf8f5] border border-stone-200/80 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Transaction:</span>
            <span className="font-semibold text-stone-900 max-w-[200px] truncate text-right">{displayTitle}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Amount:</span>
            <span className={`font-bold font-mono ${isIncome ? 'text-emerald-700' : 'text-stone-900'}`}>
              {isIncome ? '+' : '-'}{displayAmount}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Date:</span>
            <span className="text-stone-700 font-mono text-[11px]">{formatDate(transaction.transaction_date || transaction.date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Status:</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
              {transaction.payment_status || transaction.status || 'Completed'}
            </span>
          </div>
        </div>

        {transaction.payment_status === 'Completed' && (
          <div className="mb-4 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              This is a completed transaction. Deleting it will automatically reconcile and adjust your available cash balance.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            loading={loading}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            Confirm Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
