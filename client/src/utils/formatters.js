const indianDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Kolkata'
});

const indianTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata'
});

export function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(indianDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}-${parts.month}-${parts.year}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${formatDate(date)}, ${indianTimeFormatter.format(date)}`;
}

export function formatCurrency(value, currencyCode = 'INR') {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const code = typeof currencyCode === 'string' && currencyCode.trim()
    ? currencyCode.trim().toUpperCase()
    : 'INR';
  if (!/^[A-Z]{3}$/.test(code)) return `${amount.toLocaleString('en-IN')} ${code}`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `${amount.toLocaleString('en-IN')} ${code}`;
  }
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : '—';
}
