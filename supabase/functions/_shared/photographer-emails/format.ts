/**
 * Formatting for photographer automatic emails. Pure (no Deno globals) so
 * vitest can cover it. Dates are always rendered in Asia/Jerusalem.
 */
export type EmailLanguage = "en" | "he";

const TZ = "Asia/Jerusalem";

function locale(language: EmailLanguage): string {
  return language === "he" ? "he-IL" : "en-GB";
}

/** Minor units → "₪1,250" style, same rules as packages/shared formatCurrency. */
export function formatMoney(amountMinor: number, currency: string, language: EmailLanguage): string {
  return new Intl.NumberFormat(locale(language), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amountMinor / 100);
}

/** "2026-11-20" (a calendar date) → "20 November 2026" / "20 בנובמבר 2026". */
export function formatCalendarDate(isoDate: string | null | undefined, language: EmailLanguage): string {
  if (!isoDate) return "—";
  // Noon UTC keeps a bare date on the same calendar day in Jerusalem.
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(language), {
    day: "numeric", month: "long", year: "numeric", timeZone: TZ,
  }).format(date);
}

/** Timestamp → Jerusalem calendar date. */
export function formatInstantDate(iso: string | null | undefined, language: EmailLanguage): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(language), {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ,
  }).format(date);
}

/** Timestamp → Jerusalem wall-clock time, 24h. */
export function formatInstantTime(iso: string | null | undefined, language: EmailLanguage): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(language), {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ,
  }).format(date);
}
