import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, ReceiptText } from 'lucide-react';
import { formatINR, formatDate } from '../../utils/formatters';
import Badge from '../common/Badge';

export default function UpcomingTransactionsTable({ transactions = [], onOpenFixedExpenses, onRefresh }) {
  const navigate = useNavigate();

  const getStatusVariant = (status) => {
    switch (status) {
      case 'Confirmed':
      case 'Received':
        return 'success';
      case 'Critical':
      case 'Overdue':
        return 'danger';
      case 'Pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs">
      {/* Table Header with View All action */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-100">
        <div>
          <h2 className="text-sm font-bold text-stone-900 tracking-tight">
            Upcoming Transactions
          </h2>
          <p className="text-[11px] text-stone-600">
            Scheduled commitments and receivables expected in the next 14 days
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onOpenFixedExpenses && (
            <button
              onClick={onOpenFixedExpenses}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <span>⚙️ Confirmed Expenses</span>
            </button>
          )}

          <button
            onClick={() => navigate('/transactions')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700 hover:text-stone-900 transition-colors cursor-pointer"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table / Empty State */}
      {!transactions || transactions.length === 0 ? (
        <div className="py-10 text-center text-xs text-stone-500">
          <ReceiptText className="w-8 h-8 mx-auto mb-2 text-stone-300" />
          <p className="font-semibold text-stone-800 text-sm mb-1">
            No upcoming transactions scheduled yet
          </p>
          <p className="text-stone-500 max-w-sm mx-auto mb-4">
            Set your confirmed month-end expenses (Employee Salaries, Electricity bills, Facility Rent) so they automatically appear here.
          </p>
          {onOpenFixedExpenses && (
            <button
              onClick={onOpenFixedExpenses}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <span>+ Set Confirmed Monthly Expenses</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-bold tracking-wider text-stone-600 border-b border-stone-100">
              <tr>
                <th className="pb-2.5 pr-3">Description</th>
                <th className="pb-2.5 px-3">Due Date</th>
                <th className="pb-2.5 px-3">Type</th>
                <th className="pb-2.5 px-3 text-right">Amount</th>
                <th className="pb-2.5 pl-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {transactions.map((tx) => {
                const isIncoming = tx.type === 'Income' || tx.type === 'INFLOW';
                const dateVal = tx.due_date || tx.dueDate || tx.transaction_date || tx.date;
                const statusVal = tx.payment_status || tx.status || 'Completed';
                const titleVal = tx.title || tx.description || 'Transaction';

                return (
                  <tr key={tx.id} className="hover:bg-stone-50/70 transition-colors">
                    {/* Description & Category */}
                    <td className="py-3 pr-3 font-medium text-stone-800">
                      <div className="font-semibold text-stone-900 leading-tight">
                        {titleVal}
                      </div>
                      <div className="text-[10px] text-stone-600 mt-0.5">
                        {tx.counterparty ? `${tx.counterparty} • ${tx.category}` : tx.category}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                      {formatDate(dateVal, { format: 'dayMonth' })}
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          isIncoming
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {isIncoming ? (
                          <ArrowDownLeft className="w-3 h-3 text-emerald-700" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-rose-700" />
                        )}
                        {isIncoming ? 'Income' : 'Expense'}
                      </span>
                    </td>

                    {/* Amount */}
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap text-xs ${
                        isIncoming ? 'text-emerald-700' : 'text-stone-900'
                      }`}
                    >
                      {isIncoming ? '+' : '-'}{formatINR(tx.amount)}
                    </td>

                    {/* Status with Direct Changer */}
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <select
                        value={statusVal}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          try {
                            await api.updateTransaction(tx.id, { payment_status: newStatus });
                            if (onRefresh) onRefresh();
                          } catch (err) {
                            console.error('Failed to update status:', err);
                          }
                        }}
                        title="Change status: Completed, Pending, or Overdue"
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border cursor-pointer focus:outline-hidden transition-colors ${
                          statusVal === 'Completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : statusVal === 'Overdue'
                              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        <option value="Pending">⏳ Pending</option>
                        <option value="Completed">✅ Completed</option>
                        <option value="Overdue">⚠️ Overdue</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
