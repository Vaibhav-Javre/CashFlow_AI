import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#64748b'];

export default function SpendingBreakdownChart({ data = [] }) {
  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-stone-400 text-xs">No expense data</div>;
  }

  return (
    <div className="w-full flex flex-col sm:flex-row items-center gap-3">
      <div className="w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={44}
              outerRadius={66}
              paddingAngle={3}
              dataKey="amount"
              nameKey="category"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                borderColor: '#ede8e1',
                borderRadius: '0.5rem',
                color: '#1c1917',
                fontSize: '11px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.06)'
              }}
              formatter={(val) => [`$${Number(val).toLocaleString()}`, 'Amount']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 space-y-1.5 w-full">
        {data.slice(0, 5).map((item, index) => (
          <div key={item.category} className="flex items-center justify-between text-xs py-0.5">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-stone-600 font-medium truncate max-w-[120px]">
                {item.category}
              </span>
            </div>
            <span className="text-stone-900 font-bold font-mono">
              ${Number(item.amount).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
