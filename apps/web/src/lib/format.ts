export function money(cents?: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

export function longDateLabel(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(parsed);
}

export function timeLabel(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
