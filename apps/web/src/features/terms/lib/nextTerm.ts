/**
 * Defaults for a NEW term, from the studio's latest term (prefill rule: never ask blank what
 * we already know). Dates are plain YYYY-MM-DD calendar dates, computed in local time
 * (never through toISOString, which shifts to UTC).
 */

export interface NextTermDefaults {
  name?: string;
  start_date?: string;
  end_date?: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  const m = value ? ISO_DATE.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from a to b (DST-safe). */
function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS,
  );
}

/** "2026–2027" → "2027–2028" (any of - – — /), "2026" → "2027"; anything else → null. */
export function nextYearLabel(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  const range = /^(\d{4})(\s*[-–—/]\s*)(\d{4})$/.exec(trimmed);
  if (range) return `${Number(range[1]) + 1}${range[2]}${Number(range[3]) + 1}`;
  if (/^\d{4}$/.test(trimmed)) return String(Number(trimmed) + 1);
  return null;
}

/**
 * The term after the latest one (by end date): it starts the day after, lasts as many days,
 * and takes the next year label. Empty when there is no usable term.
 */
export function nextTermDefaults(
  terms: ReadonlyArray<{ name?: string | null; start_date?: string | null; end_date?: string | null }>,
): NextTermDefaults {
  const latest = terms
    .filter((term) => parseDate(term.end_date))
    .reduce<(typeof terms)[number] | null>(
      (best, term) => (!best || (term.end_date ?? '') > (best.end_date ?? '') ? term : best),
      null,
    );
  if (!latest) return {};

  const out: NextTermDefaults = {};
  const latestEnd = parseDate(latest.end_date)!;
  const start = addDays(latestEnd, 1);
  out.start_date = formatDate(start);
  const latestStart = parseDate(latest.start_date);
  if (latestStart && latestStart <= latestEnd) {
    out.end_date = formatDate(addDays(start, daysBetween(latestStart, latestEnd)));
  }
  const name = nextYearLabel(latest.name);
  if (name) out.name = name;
  return out;
}
