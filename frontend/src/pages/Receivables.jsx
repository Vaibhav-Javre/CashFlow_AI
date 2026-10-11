import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  RotateCcw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  CreditCard,
  Eye,
  Edit2,
  Trash2,
  FileText,
  ArrowDownLeft,
  DollarSign
} from 'lucide-react';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import InvoiceFormModal from '../components/receivables/InvoiceFormModal';
import InvoiceDetailsModal from '../components/receivables/InvoiceDetailsModal';
import RecordPaymentModal from '../components/common/RecordPaymentModal';
import DeleteConfirmDialog from '../components/transactions/DeleteConfirmDialog';
import { api } from '../api/client';
import { formatINR, formatDate } from '../utils/formatters';

export default function Receivables({ onRefreshApp }) {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState({
    total_outstanding: 0,
    overdue_amount: 0,
    due_in_next_7_days: 0,
    amount_received_this_month: 0,
    total_invoices: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Filters & Controls
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('due_date');
  const [sortOrder, setSortOrder] = useState('asc');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedDetailsId, setSelectedDetailsId] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [deletingInvoice, setDeletingInvoice] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.sort_by = sortBy;
      params.sort_order = sortOrder;

      const [listRes, sumRes] = await Promise.all([
        api.getReceivables(params),
        api.getReceivablesSummary().catch(() => null)
      ]);

      if (listRes && listRes.data) {
        setInvoices(listRes.data);
      }
      if (sumRes && sumRes.summary) {
        setSummary(sumRes.summary);
      }
    } catch (err) {
      console.error('Failed to load receivables:', err);
      setError('Failed to connect to backend server. Please verify connection.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, startDate, endDate, sortBy, sortOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Notice timer
  useEffect(() => {
    if (actionNotice) {
      const timer = setTimeout(() => setActionNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionNotice]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSortBy('due_date');
    setSortOrder('asc');
  };

  const hasActiveFilters = Boolean(
    search ||
    statusFilter !== 'ALL' ||
    startDate ||
    endDate ||
    sortBy !== 'due_date' ||
    sortOrder !== 'asc'
  );

  const handleOpenAdd = () => {
    setEditingInvoice(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (inv) => {
    setEditingInvoice(inv);
    setIsFormModalOpen(true);
  };

  const handleOpenRecordPayment = (inv) => {
    setPaymentTarget({
      id: inv.id,
      type: 'receivable',
      number: inv.invoice_number,
      partyName: inv.customer_name,
      totalAmount: inv.invoice_amount,
      amountPaid: inv.amount_paid,
      outstandingBalance: inv.outstanding_balance
    });
  };

  const handleConfirmDelete = async () => {
    if (!deletingInvoice) return;
    try {
      setIsDeleting(true);
      await api.deleteReceivable(deletingInvoice.id);
      setActionNotice({
        type: 'success',
        message: `Invoice #${deletingInvoice.invoice_number} deleted successfully.`
      });
      setDeletingInvoice(null);
      loadData();
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to delete invoice.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOperationSuccess = (msg) => {
    setActionNotice({
      type: 'success',
      message: msg || 'Action completed successfully.'
    });
    loadData();
    if (onRefreshApp) onRefreshApp();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5" /> Paid
          </span>
        );
      case 'Overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-2.5 h-2.5" /> Overdue
          </span>
        );
      case 'Due Soon':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-2.5 h-2.5" /> Due Soon
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-fade-fast">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Accounts Receivable
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Track customer invoices, incoming collections, and cash receipts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleOpenAdd}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold shadow-xs"
          >
            + Add Invoice
          </Button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-pop-fast ${
          actionNotice.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-stone-400 hover:text-stone-600 font-bold px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2. Four Summary KPI Cards (Requirement 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Outstanding */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-xs font-semibold text-stone-600 block">Total Outstanding</span>
          <div className="text-lg sm:text-xl font-bold font-mono text-stone-900 mt-1">
            {formatINR(summary.total_outstanding)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            Uncollected invoices balance
          </div>
        </div>

        {/* Card 2: Overdue Amount */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-xs font-semibold text-rose-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Overdue Amount
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-rose-700 mt-1">
            {formatINR(summary.overdue_amount)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {summary.overdue_count || 0} invoice{summary.overdue_count === 1 ? '' : 's'} past deadline
          </div>
        </div>

        {/* Card 3: Due in the Next 7 Days */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Due in Next 7 Days
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-amber-800 mt-1">
            {formatINR(summary.due_in_next_7_days)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            Immediate cash inflows expected
          </div>
        </div>

        {/* Card 4: Amount Received This Month */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Received This Month
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatINR(summary.amount_received_this_month)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            Collected customer payments
          </div>
        </div>
      </div>

      {/* 3. Search, Filters, and Sorting Controls */}
      <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice # or customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { id: 'ALL', label: 'All Invoices' },
              { id: 'Overdue', label: 'Overdue' },
              { id: 'Due Soon', label: 'Due Soon' },
              { id: 'Pending', label: 'Pending' },
              { id: 'Paid', label: 'Paid' }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all ${
                  statusFilter === st.id
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range & Sort Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-stone-100 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Due Date From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Due Date To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Sort By</label>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
              >
                <option value="due_date">Due Date</option>
                <option value="outstanding">Outstanding</option>
                <option value="amount">Total Amount</option>
                <option value="customer">Customer</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                title={`Sort ${sortOrder === 'desc' ? 'Descending' : 'Ascending'}`}
                className="px-2 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg text-stone-700 font-semibold cursor-pointer shrink-0"
              >
                {sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                hasActiveFilters
                  ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200 cursor-pointer'
                  : 'bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3 h-3" /> Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* 4. Receivables Table (Requirement 2) */}
      <div className="rounded-xl bg-white border border-stone-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-12">
            <LoadingSpinner message="Loading customer invoices..." />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs space-y-2">
            <AlertTriangle className="w-7 h-7 mx-auto text-amber-500" />
            <p className="text-stone-700 font-medium">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadData}>
              Try Again
            </Button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs space-y-3">
            <FileText className="w-8 h-8 mx-auto text-stone-300" />
            <div className="text-stone-800 font-semibold text-sm">No invoices found</div>
            <p className="text-stone-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No invoices match your active filters. Try resetting filters.'
                : 'No invoices recorded yet. Click below to add your first customer invoice.'}
            </p>
            {hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Reset Filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenAdd} className="bg-emerald-700 text-white">
                Create First Invoice
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f5] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Invoice Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4 text-right">Invoice Amount</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Outstanding</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-800 whitespace-nowrap">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-stone-900 truncate">{inv.customer_name}</div>
                        {inv.customer_contact && (
                          <div className="text-[10px] text-stone-400 truncate">{inv.customer_contact}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                        {formatDate(inv.invoice_date, { format: 'dayMonth' })}
                      </td>
                      <td className="py-3 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                        {formatDate(inv.due_date, { format: 'dayMonth' })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-stone-800 whitespace-nowrap">
                        {formatINR(inv.invoice_amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700 whitespace-nowrap">
                        {inv.amount_paid > 0 ? `+${formatINR(inv.amount_paid)}` : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold text-xs whitespace-nowrap ${
                        inv.outstanding_balance > 0 ? 'text-stone-900' : 'text-emerald-700'
                      }`}>
                        {formatINR(inv.outstanding_balance)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(inv.status)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Details */}
                          <button
                            onClick={() => setSelectedDetailsId(inv.id)}
                            title="View Details"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Record Payment */}
                          {inv.outstanding_balance > 0 && (
                            <button
                              onClick={() => handleOpenRecordPayment(inv)}
                              title="Record Customer Payment"
                              className="p-1.5 rounded-lg text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEdit(inv)}
                            title="Edit Invoice"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeletingInvoice(inv)}
                            title="Delete Invoice"
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card-Based List */}
            <div className="block md:hidden divide-y divide-stone-100">
              {invoices.map((inv) => (
                <div key={inv.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-stone-900">{inv.invoice_number}</span>
                      <div className="font-semibold text-xs text-stone-800">{inv.customer_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-stone-900">
                        {formatINR(inv.outstanding_balance)}
                      </div>
                      <span className="text-[10px] text-stone-400">of {formatINR(inv.invoice_amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono">Due: {formatDate(inv.due_date)}</span>
                      <span>&bull;</span>
                      {getStatusBadge(inv.status)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedDetailsId(inv.id)}
                        className="p-1 rounded text-stone-500 hover:bg-stone-100"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {inv.outstanding_balance > 0 && (
                        <button
                          onClick={() => handleOpenRecordPayment(inv)}
                          className="p-1 rounded text-emerald-700 hover:bg-emerald-50"
                          title="Record Payment"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(inv)}
                        className="p-1 rounded text-stone-500 hover:bg-stone-100"
                        title="Edit Invoice"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingInvoice(inv)}
                        className="p-1 rounded text-rose-500 hover:bg-rose-50"
                        title="Delete Invoice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Invoice Modal */}
      <InvoiceFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingInvoice(null);
        }}
        onSuccess={() => handleOperationSuccess(editingInvoice ? 'Invoice updated successfully.' : 'New invoice recorded successfully.')}
        invoiceToEdit={editingInvoice}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={Boolean(paymentTarget)}
        item={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSuccess={() => handleOperationSuccess('Customer payment recorded and reconciled successfully.')}
      />

      {/* Invoice Details Modal */}
      <InvoiceDetailsModal
        isOpen={Boolean(selectedDetailsId)}
        invoiceId={selectedDetailsId}
        onClose={() => setSelectedDetailsId(null)}
        onRecordPayment={(inv) => handleOpenRecordPayment(inv)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmDialog
        isOpen={Boolean(deletingInvoice)}
        transaction={deletingInvoice ? {
          title: `Invoice #${deletingInvoice.invoice_number} (${deletingInvoice.customer_name})`,
          amount: deletingInvoice.outstanding_balance,
          date: deletingInvoice.due_date,
          type: 'Income',
          status: deletingInvoice.status
        } : null}
        onClose={() => setDeletingInvoice(null)}
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </div>
  );
}
