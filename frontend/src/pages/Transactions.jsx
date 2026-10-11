import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Filter,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  Edit2,
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import TransactionFormModal from '../components/transactions/TransactionFormModal';
import DeleteConfirmDialog from '../components/transactions/DeleteConfirmDialog';
import { api } from '../api/client';
import { formatINR, formatDate } from '../utils/formatters';

const ALL_CATEGORIES = [
  'Sales Revenue',
  'Customer Payment',
  'Service Income',
  'Other Income',
  'Inventory Purchase',
  'Supplier Payment',
  'Salary',
  'Rent',
  'Utilities',
  'Transportation',
  'Marketing',
  'Equipment',
  'Tax',
  'Other Expense'
];

export default function Transactions({ onOpenNewTransaction, onRefreshApp }) {
  // State for transactions list and summary
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    total_income: 0,
    total_expenses: 0,
    net_cash_flow: 0,
    total_transactions: 0,
    completed_income: 0,
    completed_expenses: 0,
    net_realized_cash_flow: 0,
    pending_income: 0,
    pending_expenses: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Filter and Search states
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, Income, Expense
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, Completed, Pending, Overdue
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'amount'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deletingTransaction, setDeletingTransaction] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch transactions and summary
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {};
      if (search.trim()) params.search = search.trim();
      if (filterType !== 'ALL') params.type = filterType;
      if (filterCategory !== 'ALL') params.category = filterCategory;
      if (filterStatus !== 'ALL') params.status = filterStatus;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.sort_by = sortBy;
      params.sort_order = sortOrder;

      // Concurrent fetch for records and summary
      const [listRes, sumRes] = await Promise.all([
        api.getTransactions(params),
        api.getTransactionSummary({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          category: filterCategory !== 'ALL' ? filterCategory : undefined,
          search: search.trim() || undefined
        }).catch(() => null)
      ]);

      if (listRes && listRes.data) {
        setTransactions(listRes.data);
      }

      if (sumRes && sumRes.summary) {
        setSummary(sumRes.summary);
      } else if (listRes && listRes.data) {
        // Fallback calculations if summary call fails
        let inc = 0, exp = 0;
        listRes.data.forEach((t) => {
          const amt = Number(t.amount) || 0;
          if (t.type === 'Income' || t.type === 'INFLOW') inc += amt;
          else exp += amt;
        });
        setSummary({
          total_income: inc,
          total_expenses: exp,
          net_cash_flow: inc - exp,
          total_transactions: listRes.data.length
        });
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError('Failed to load transactions from backend server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [search, filterType, filterCategory, filterStatus, startDate, endDate, sortBy, sortOrder]);

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

  // Reset all filters
  const handleResetFilters = () => {
    setSearch('');
    setFilterType('ALL');
    setFilterCategory('ALL');
    setFilterStatus('ALL');
    setStartDate('');
    setEndDate('');
    setSortBy('date');
    setSortOrder('desc');
  };

  const hasActiveFilters = Boolean(
    search ||
    filterType !== 'ALL' ||
    filterCategory !== 'ALL' ||
    filterStatus !== 'ALL' ||
    startDate ||
    endDate ||
    sortBy !== 'date' ||
    sortOrder !== 'desc'
  );

  // Handle Edit Action
  const handleOpenEdit = (tx) => {
    setEditingTransaction(tx);
    setIsFormModalOpen(true);
  };

  // Handle Add Action
  const handleOpenAdd = () => {
    setEditingTransaction(null);
    setIsFormModalOpen(true);
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!deletingTransaction) return;
    try {
      setIsDeleting(true);
      await api.deleteTransaction(deletingTransaction.id);
      setActionNotice({
        type: 'success',
        message: `Transaction "${deletingTransaction.title || deletingTransaction.description}" deleted successfully.`
      });
      setDeletingTransaction(null);
      loadData();
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to delete transaction'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setActionNotice({
      type: 'success',
      message: editingTransaction
        ? 'Transaction updated successfully.'
        : 'New transaction recorded successfully.'
    });
    loadData();
    if (onRefreshApp) onRefreshApp();
  };

  return (
    <div className="space-y-5 animate-fade-fast">
      {/* 1. Header Section (Requirement 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Transactions
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Track and manage your business income and expenses.
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
            + Add Transaction
          </Button>
        </div>
      </div>

      {/* Global Notification Banner */}
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

      {/* 2. Four Compact Summary Cards (Requirement 2 & 8) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Income */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600">Total Income</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700">
            {formatINR(summary.total_income)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-1">
            <span>Settled: {formatINR(summary.completed_income || summary.total_income)}</span>
          </div>
        </div>

        {/* Card 2: Total Expenses */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600">Total Expenses</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-stone-900">
            {formatINR(summary.total_expenses)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-1">
            <span>Settled: {formatINR(summary.completed_expenses || summary.total_expenses)}</span>
          </div>
        </div>

        {/* Card 3: Net Cash Flow */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600">Net Cash Flow</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              summary.net_cash_flow >= 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-lg sm:text-xl font-bold font-mono ${
            summary.net_cash_flow >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}>
            {formatINR(summary.net_cash_flow, { sign: true })}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            Realized: <span className="font-mono font-medium text-stone-700">{formatINR(summary.net_realized_cash_flow ?? summary.net_cash_flow)}</span>
          </div>
        </div>

        {/* Card 4: Total Transactions */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600">Total Transactions</span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-stone-900">
            {summary.total_transactions}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {transactions.length} record{transactions.length === 1 ? '' : 's'} displayed
          </div>
        </div>
      </div>

      {/* 3. Search, Filters, and Sorting Bar (Requirement 5) */}
      <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-3">
        {/* Row 1: Search and Type Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search title, counterparty, or reference #..."
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

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 self-start lg:self-auto">
            {[
              { id: 'ALL', label: 'All Types' },
              { id: 'Income', label: 'Income' },
              { id: 'Expense', label: 'Expense' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  filterType === t.id
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Secondary Dropdowns (Category, Status, Date Range, Sort) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-stone-100 text-xs">
          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
            >
              <option value="ALL">All Categories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 font-mono focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 font-mono focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* Sort By & Order */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
              Sort By
            </label>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-2 py-1.5 bg-[#fdfcfb] border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
              >
                <option value="date">Date</option>
                <option value="amount">Amount</option>
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

          {/* Reset Filters Option */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                hasActiveFilters
                  ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                  : 'bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* 4. Transaction Table & Card View (Requirement 4) */}
      <div className="rounded-xl bg-white border border-stone-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-12">
            <LoadingSpinner message="Loading financial records..." />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs space-y-2">
            <AlertTriangle className="w-7 h-7 mx-auto text-amber-500" />
            <p className="text-stone-700 font-medium">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadData}>
              Try Again
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs space-y-3">
            <Receipt className="w-8 h-8 mx-auto text-stone-300" />
            <div className="text-stone-800 font-semibold text-sm">No transactions found</div>
            <p className="text-stone-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No records match your active search and filter criteria. Try resetting filters.'
                : 'No transactions recorded yet. Click below to add your first income or expense.'}
            </p>
            {hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Reset Filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenAdd} className="bg-emerald-700 text-white">
                Record First Transaction
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f5] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Transaction</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {transactions.map((tx) => {
                    const isIncome = tx.type === 'Income' || tx.type === 'INFLOW';
                    const txStatus = tx.payment_status || tx.status || 'Completed';

                    return (
                      <tr key={tx.id} className="hover:bg-stone-50/70 transition-colors duration-150">
                        {/* Transaction Title & Counterparty */}
                        <td className="py-3 px-4 font-medium text-stone-900 max-w-xs">
                          <div className="font-semibold text-stone-900 truncate">
                            {tx.title || tx.description || 'Untitled Transaction'}
                          </div>
                          <div className="text-[11px] text-stone-500 flex items-center gap-1.5 truncate">
                            {tx.counterparty ? (
                              <span>{tx.counterparty}</span>
                            ) : (
                              <span className="text-stone-400">Direct</span>
                            )}
                            {tx.reference_number && (
                              <>
                                <span>&bull;</span>
                                <span className="font-mono text-stone-400 text-[10px]">{tx.reference_number}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4 text-stone-600 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-700">
                            {tx.category || 'General'}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                          {formatDate(tx.transaction_date || tx.date, { format: 'dayMonth' })}
                        </td>

                        {/* Type Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            isIncome
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {isIncome ? (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-700" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-rose-700" />
                            )}
                            {isIncome ? 'Income' : 'Expense'}
                          </span>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3 px-4 text-stone-600 whitespace-nowrap">
                          {tx.payment_method || 'Bank Transfer'}
                        </td>

                        {/* Amount */}
                        <td className={`py-3 px-4 text-right font-bold font-mono text-xs whitespace-nowrap ${
                          isIncome ? 'text-emerald-700' : 'text-stone-900'
                        }`}>
                          {isIncome ? '+' : '-'}{formatINR(tx.amount)}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            txStatus === 'Completed'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : txStatus === 'Pending'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {txStatus === 'Completed' ? (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            ) : (
                              <Clock className="w-2.5 h-2.5" />
                            )}
                            {txStatus}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(tx)}
                              title="Edit Transaction"
                              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingTransaction(tx)}
                              title="Delete Transaction"
                              className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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

            {/* Mobile Card-Based List View */}
            <div className="block md:hidden divide-y divide-stone-100">
              {transactions.map((tx) => {
                const isIncome = tx.type === 'Income' || tx.type === 'INFLOW';
                const txStatus = tx.payment_status || tx.status || 'Completed';

                return (
                  <div key={tx.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-xs text-stone-900">
                          {tx.title || tx.description || 'Untitled Transaction'}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {tx.counterparty || 'Direct'} &bull; {tx.category}
                        </div>
                      </div>
                      <div className={`font-mono font-bold text-xs shrink-0 ${
                        isIncome ? 'text-emerald-700' : 'text-stone-900'
                      }`}>
                        {isIncome ? '+' : '-'}{formatINR(tx.amount)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{formatDate(tx.transaction_date || tx.date)}</span>
                        <span>&bull;</span>
                        <span>{tx.payment_method || 'Bank Transfer'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          txStatus === 'Completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {txStatus}
                        </span>
                        <button
                          onClick={() => handleOpenEdit(tx)}
                          className="p-1 rounded text-stone-500 hover:bg-stone-100"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTransaction(tx)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Transaction Modal */}
      <TransactionFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={handleFormSuccess}
        transactionToEdit={editingTransaction}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmDialog
        isOpen={Boolean(deletingTransaction)}
        transaction={deletingTransaction}
        onClose={() => setDeletingTransaction(null)}
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </div>
  );
}
