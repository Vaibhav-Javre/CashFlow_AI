import React from 'react';

const iconColorMap = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
  rose: 'bg-rose-50 text-rose-700 border-rose-200/80',
  stone: 'bg-stone-50 text-stone-700 border-stone-200/80',
  blue: 'bg-blue-50 text-blue-700 border-blue-200/80'
};

const badgeStyles = {
  Low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Moderate: 'bg-amber-50 text-amber-800 border-amber-200',
  High: 'bg-rose-50 text-rose-700 border-rose-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  neutral: 'bg-stone-50 text-stone-600 border-stone-200'
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accentColor = 'stone',
  statusBadge,
  badgeText,
  badgeVariant,
  infoTag,
  className = ''
}) {
  const chosenBadgeText = statusBadge?.text || badgeText;
  const chosenBadgeVariant = statusBadge?.variant || badgeVariant || chosenBadgeText;

  return (
    <div
      className={`h-full p-4 sm:p-5 rounded-xl bg-white border border-stone-200 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between ${className}`}
    >
      {/* Header: Title and Cash/Indicator Icon */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
            {title}
          </span>
          {Icon && (
            <div className={`p-2 rounded-lg border ${iconColorMap[accentColor] || iconColorMap.stone}`}>
              <Icon className="w-4 h-4 shrink-0" />
            </div>
          )}
        </div>

        {/* Primary prominent value */}
        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 font-mono">
            {value}
          </h3>
          {chosenBadgeText && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                badgeStyles[chosenBadgeVariant] || badgeStyles.neutral
              }`}
            >
              {chosenBadgeText}
            </span>
          )}
        </div>
      </div>

      {/* Footer: Concise Supporting Text & Count Tag */}
      {(subtitle || infoTag) && (
        <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
          <span className="truncate font-medium">{subtitle}</span>
          {infoTag && (
            <span className="font-medium text-stone-700 shrink-0 ml-2">
              {infoTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
