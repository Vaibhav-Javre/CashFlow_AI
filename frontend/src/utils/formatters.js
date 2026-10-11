/**
 * Indian Rupee (INR) and Financial Formatters
 * Uses the Indian numbering system (Lakhs and Crores: 1,00,000 / 1,00,00,000)
 */

export function formatINR(amount, options = {}) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }

  const num = Number(amount);
  const {
    showDecimals = false,
    compact = false,
    sign = false
  } = options;

  let prefix = '₹';
  let signPrefix = '';
  if (sign && num > 0) signPrefix = '+';
  if (num < 0) {
    signPrefix = '-';
  }

  const absVal = Math.abs(num);

  if (compact) {
    if (absVal >= 10000000) {
      return `${signPrefix}${prefix}${(absVal / 10000000).toFixed(2)} Cr`;
    }
    if (absVal >= 100000) {
      return `${signPrefix}${prefix}${(absVal / 100000).toFixed(2)} L`;
    }
    if (absVal >= 1000) {
      return `${signPrefix}${prefix}${(absVal / 1000).toFixed(1)}k`;
    }
    return `${signPrefix}${prefix}${absVal.toFixed(0)}`;
  }

  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0
  }).format(absVal);

  return `${signPrefix}${prefix}${formatted}`;
}

/**
 * Compact Y-Axis formatter for Recharts
 */
export function formatINRAxis(val) {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  const num = Number(val);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `${sign}₹${(abs / 1000).toFixed(0)}k`;
  }
  return `${sign}₹${abs}`;
}

/**
 * Standard date formatter
 */
export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const { format = 'short' } = options;

    if (format === 'dayMonth') {
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: format === 'full' ? 'numeric' : undefined
    });
  } catch (e) {
    return dateStr;
  }
}
