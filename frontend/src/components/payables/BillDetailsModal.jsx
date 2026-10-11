import React, { useState, useEffect } from 'react';
import { X, Receipt, CheckCircle2, Clock, AlertTriangle, Plus, CreditCard, Calendar, Building2 } from 'lucide-react';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import { api } from '../../api/client';
import { formatINR, formatDate } from '../../utils/formatters';

export default function BillDetailsModal({
  isOpen,
  billId,
  onClose,
  onRecordPayment
}) {
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && billId) {
      loadDetails();
    }
  }, [isOpen, billId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPayable(billId);
      setBill(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load bill details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (status) => {
    if (status === 'Paid') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Paid</span>;
    }
    if (status === 'Overdue') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Overdue</span>;
    }
    if (status === 'Due Soon') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Due Soon</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">Pending</span>;
  };

  const getPriorityBadge = (priority) => {
    if (priority === 'CRITICAL') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Critical</span>;
    }
    if (priority === 'HIGH') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">High</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">Standard</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto animate-fade-fast">
      <div className="w-full max-w-xl bg-white border border-stone-200 rounded-2xl shadow-xl p-5 my-6 max-h-[90vh] overflow-y-auto animate-pop-fast">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900 font-mono">
                  {bill?.bill_number || bill?.invoice_number || 'Bill Details'}
                </h3>
                {bill && getStatusBadge(bill.status)}
                {bill && getPriorityBadge(bill.priority)}
              </div>
              <p className="text-[11px] text-stone-500">
                Supplier bill details and recorded disbursements
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12">
            <LoadingSpinner message="Loading disbursement history..." />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600">
            {error}
          </div>
        ) : bill ? (
          <div className="mt-4 space-y-4 text-xs">
            {/* KPI Cards: Total, Paid, Outstanding */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-[#faf8f5] border border-stone-200">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Total Bill</span>
                <span className="text-base font-bold font-mono text-stone-900 mt-0.5 block">
                  {formatINR(bill.bill_amount)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-[10px] text-stone-600 uppercase font-semibold block">Disbursed</span>
                <span className="text-base font-bold font-mono text-stone-800 mt-0.5 block">
                  {formatINR(bill.amount_paid)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200">
                <span className="text-[10px] text-rose-700 uppercase font-semibold block">Remaining Due</span>
                <span className={`text-base font-bold font-mono mt-0.5 block ${
                  bill.outstanding_balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                  {formatINR(bill.outstanding_balance)}
                </span>
              </div>
            </div>

            {/* Metadata Overview */}
            <div className="p-3.5 rounded-xl border border-stone-200 bg-[#fdfcfb] space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Supplier</span>
                  <span className="font-semibold text-stone-900 text-xs">{bill.supplier_name}</span>
                  {bill.supplier_contact && (
                    <span className="text-[11px] text-stone-500 block">{bill.supplier_contact}</span>
                  )}
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Category</span>
                  <span className="text-stone-800 font-medium">{bill.category}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Bill Date</span>
                  <span className="font-mono text-stone-700">{formatDate(bill.bill_date)}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Due Date</span>
                  <span className="font-mono text-stone-700">{formatDate(bill.due_date)}</span>
                </div>
              </div>

              {bill.description && (
                <div className="pt-2 border-t border-stone-100">
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Remarks / Notes</span>
                  <p className="text-stone-700 mt-0.5 leading-relaxed">{bill.description}</p>
                </div>
              )}
            </div>

            {/* Disbursement History Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-stone-900">
                  Disbursement History ({bill.payments?.length || 0})
                </h4>
                {bill.outstanding_balance > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                      onClose();
                      onRecordPayment(bill);
                    }}
                    className="bg-rose-700 hover:bg-rose-800 text-white text-[11px] py-1 px-2.5"
                  >
                    Record Disbursement
                  </Button>
                )}
              </div>

              {(!bill.payments || bill.payments.length === 0) ? (
                <div className="p-6 text-center rounded-xl bg-stone-50 border border-stone-200 text-stone-400 text-xs">
                  No disbursements have been recorded for this bill yet.
                </div>
              ) : (
                <div className="rounded-xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#faf8f5] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Method</th>
                        <th className="py-2 px-3">Reference #</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {bill.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-stone-50/70">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-700">
                            {formatDate(p.payment_date)}
                          </td>
                          <td className="py-2.5 px-3 text-stone-700 font-medium">
                            {p.payment_method || 'Bank Transfer'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
                            {p.reference_number || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                            -{formatINR(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
