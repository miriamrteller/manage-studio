/**
 * Template variables for each automatic email, built from RPC results.
 * Pure — covered by apps/web/src/__tests__/photographer-email-variables.test.ts.
 */
import {
  type EmailLanguage,
  formatCalendarDate,
  formatInstantDate,
  formatInstantTime,
  formatMoney,
} from "./format.ts";

/** Subset of accept_quote()'s result used by the booking confirmation. */
export interface AcceptQuoteResult {
  ok: boolean;
  already_accepted?: boolean;
  quote_id?: string;
  engagement_id?: string;
  total_minor?: number;
  deposit_minor?: number;
  balance_minor?: number;
  currency?: string;
  shoot_date?: string | null;
  balance_due_date?: string | null;
  send_contract?: boolean;
  /** Deposit first (when deposit_minor > 0), then balance. */
  payment_request_ids?: string[];
  code?: string;
}

/** Row of list_due_shoot_emails(). */
export interface DueShootEmail {
  email_key: "shoot_reminder" | "shoot_thank_you" | "gallery_ready";
  tenant_id: string;
  engagement_id: string;
  recipient_email: string;
  recipient_name: string | null;
  shoot_starts_at: string | null;
  location: string | null;
  gallery_url: string | null;
  offering_name: string | null;
}

export function bookingConfirmedVariables(
  result: AcceptQuoteResult,
  input: {
    recipientName: string | null;
    quoteUrl: string;
    language: EmailLanguage;
    /** Absolute contract signing link (step 1), when the client should sign. */
    signUrl?: string | null;
    /** Absolute deposit pay link (step 2), while the deposit is unpaid. */
    payUrl?: string | null;
  },
): Record<string, string> {
  const currency = result.currency ?? "ILS";
  const money = (minor: number | undefined) =>
    typeof minor === "number" ? formatMoney(minor, currency, input.language) : "—";
  return {
    recipientName: input.recipientName?.trim() || (input.language === "he" ? "לקוח/ה יקר/ה" : "there"),
    shootDate: formatCalendarDate(result.shoot_date, input.language),
    totalFormatted: money(result.total_minor),
    depositFormatted: money(result.deposit_minor),
    balanceFormatted: money(result.balance_minor),
    balanceDueDate: formatCalendarDate(result.balance_due_date, input.language),
    quoteUrl: input.quoteUrl,
    // Only safe http(s) links; an absent step drops out of the email (render.ts).
    ...(isSafeLink(input.signUrl) ? { signUrl: input.signUrl as string } : {}),
    ...(isSafeLink(input.payUrl) ? { payUrl: input.payUrl as string } : {}),
  };
}

export function dueShootEmailVariables(row: DueShootEmail, language: EmailLanguage): Record<string, string> {
  const recipientName = row.recipient_name?.trim() || (language === "he" ? "לקוח/ה יקר/ה" : "there");
  switch (row.email_key) {
    case "shoot_reminder":
      return {
        recipientName,
        shootDate: formatInstantDate(row.shoot_starts_at, language),
        shootTime: formatInstantTime(row.shoot_starts_at, language),
        location: row.location?.trim() || "—",
      };
    case "shoot_thank_you":
      return { recipientName };
    case "gallery_ready":
      return { recipientName, galleryUrl: row.gallery_url ?? "" };
    default: {
      const exhaustive: never = row.email_key;
      throw new Error(`Unknown shoot email ${String(exhaustive)}`);
    }
  }
}

/** Only http(s) links may go into an email button. */
export function isSafeLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
