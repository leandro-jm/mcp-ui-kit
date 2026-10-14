import type { FieldFormat } from '@mcp-ui-kit/view-spec';

const isDateLike = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Display text of a value; numbers and dates follow the viewer's locale. Never returns markup. */
export function formatValue(value: unknown, format: FieldFormat | undefined, locale: string, yesNo: [string, string] = ['Yes', 'No']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof format === 'object' && typeof value === 'number') {
    return value.toLocaleString(locale, { style: 'currency', currency: format.currency });
  }
  switch (format) {
    case 'integer':
      return typeof value === 'number' ? Math.round(value).toLocaleString(locale) : String(value);
    case 'number':
      return typeof value === 'number' ? value.toLocaleString(locale, { maximumFractionDigits: 2 }) : String(value);
    case 'percent':
      return typeof value === 'number' ? value.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 }) : String(value);
    case 'date':
      return isDateLike(value) ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(locale) : String(value);
    case 'datetime':
      return isDateLike(value) ? new Date(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : String(value);
    case 'boolean':
      return value ? yesNo[0] : yesNo[1];
    default:
      if (typeof value === 'number') return value.toLocaleString(locale);
      if (typeof value === 'boolean') return value ? yesNo[0] : yesNo[1];
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

export const isNumericFormat = (f: FieldFormat | undefined): boolean =>
  typeof f === 'object' || f === 'number' || f === 'integer' || f === 'percent';

/** "Nice" upper bound for an axis. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
