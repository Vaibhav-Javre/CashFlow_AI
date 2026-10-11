import React from 'react';

const variantStyles = {
  default: 'bg-stone-100 text-stone-700 border-stone-200/80',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200'
};

export default function Badge({ children, variant = 'default', className = '' }) {
  const chosen = variantStyles[variant] || variantStyles.default;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${chosen} transition-all duration-150 ${className}`}>
      {children}
    </span>
  );
}
