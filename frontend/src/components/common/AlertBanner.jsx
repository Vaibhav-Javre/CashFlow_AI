import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';

const bannerStyles = {
  CRITICAL: {
    bg: 'bg-rose-50/90 border-rose-200 text-rose-900',
    icon: AlertTriangle,
    iconColor: 'text-rose-600'
  },
  WARNING: {
    bg: 'bg-amber-50/90 border-amber-200 text-amber-900',
    icon: AlertCircle,
    iconColor: 'text-amber-600'
  },
  INFO: {
    bg: 'bg-blue-50/90 border-blue-200 text-blue-900',
    icon: Info,
    iconColor: 'text-blue-600'
  },
  SUCCESS: {
    bg: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600'
  }
};

export default function AlertBanner({
  title,
  message,
  type = 'WARNING',
  actionText,
  onAction,
  onDismiss,
  className = ''
}) {
  const style = bannerStyles[type] || bannerStyles.INFO;
  const Icon = style.icon;

  return (
    <div className={`p-3.5 rounded-xl border flex items-start gap-3 shadow-2xs animate-fade-fast transition-all duration-150 ${style.bg} ${className}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
      <div className="flex-1">
        {title && <h4 className="font-bold text-xs mb-0.5 text-stone-900">{title}</h4>}
        <p className="text-xs leading-relaxed text-stone-700">{message}</p>
        {actionText && onAction && (
          <button
            onClick={onAction}
            className="mt-1 text-xs font-bold underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer text-stone-900"
          >
            {actionText} &rarr;
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-stone-400 hover:text-stone-700 p-0.5 rounded transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
