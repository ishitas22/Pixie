// API dates are calendar dates, never converted through a device timezone.
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
export function formatDate(value: string | null | undefined): string {
  if (!value || !isIsoDate(value)) return '';
  const [year, month, day] = value.split('-');
  return `${month}/${day}/${year}`;
}
export function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return isIsoDate(iso) ? iso : null;
}
