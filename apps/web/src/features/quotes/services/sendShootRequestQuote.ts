import { newQuoteDraft, quotePrefillFromSource } from '../lib/quoteDraft';
import { QuoteService } from './quoteService';
import { sendQuoteEmail } from './sendQuoteEmail';

export interface ShootRequestQuoteInput {
  tenantId: string;
  emailLanguage: string;
  engagementId: string;
  offeringId: string;
  clientName: string;
  /** The confirmed shoot's start (ISO), or null when no time was set. */
  bookedStartsAt: string | null;
}

export interface ShootRequestQuoteResult {
  quoteId: string | null;
  /** True when the client was emailed the quote (to accept and pay the deposit). */
  sent: boolean;
}

/**
 * Owner (13 Nov 2026): confirming a shoot request books it and sends the
 * client the quote at once, to accept and pay the deposit. The quote is the
 * package at its price, on the shoot's day, with the usual deposit. If the
 * client has no email or quote emails are switched off, the quote is saved
 * and not sent, so the studio can send it another way from the quote page.
 */
export async function sendShootRequestQuote(input: ShootRequestQuoteInput): Promise<ShootRequestQuoteResult> {
  const packages = await QuoteService.packages(input.tenantId);
  const prefill = quotePrefillFromSource({
    job: {
      client_name: input.clientName,
      offering_id: input.offeringId,
      package_name: null,
      price_minor: null,
      booked_starts_at: input.bookedStartsAt,
    },
    packages,
  });
  const quoteId = await QuoteService.save(
    newQuoteDraft({ leadId: null, engagementId: input.engagementId }, new Date(), prefill),
  );

  const [quote, emails] = await Promise.all([QuoteService.get(quoteId), QuoteService.automaticEmails(input.tenantId)]);
  if (!quote?.client_email || emails.quote_sent === false || quote.lines.length === 0) {
    return { quoteId, sent: false };
  }
  await QuoteService.markSent(quoteId, 'email');
  await sendQuoteEmail(quote, input.tenantId, input.emailLanguage);
  return { quoteId, sent: true };
}
