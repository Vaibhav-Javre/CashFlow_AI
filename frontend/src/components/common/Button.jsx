import React from 'react';

const variantClasses = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xs hover:shadow-sm focus:ring-blue-500',
  secondary: 'bg-white hover:bg-stone-50 active:scale-95 text-stone-700 border border-stone-200 shadow-xs focus:ring-stone-400',
  danger: 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-xs focus:ring-rose-500',
  success: 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs focus:ring-emerald-500',
  ghost: 'bg-transparent hover:bg-stone-100/80 active:scale-95 text-stone-600 hover:text-stone-900 focus:ring-stone-400'
};

const sizeClasses = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-xs font-semibold',
  lg: 'px-4 py-2 text-sm font-semibold'
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  icon: Icon,
  className = '',
  type = 'button'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-stone-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
      ) : Icon ? (
        <Icon className={`w-3.5 h-3.5 ${children ? 'mr-1.5' : ''}`} />
      ) : null}
      {children}
    </button>
  );
}
