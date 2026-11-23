const bdt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatBdt(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${bdt.format(number)} BDT` : '—';
}

export function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '—';
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function titleCase(value) {
  return String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
