import type { QuoteDraft, QuoteLineDraft } from './quoteSchemas';
import type { QuoteDetail, QuotePackage } from '../services/quoteService';

const DEFAULT_DEPOSIT_PERCENT = 30;
const DEFAULT_VALIDITY_DAYS = 14;

function isoDateInJerusalem(date: Date): string {
  // en-CA renders YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

/** What OpalSwift already knows about the quote's lead or shoot (all editable in the editor). */
export interface QuoteDraftPrefill {
  title: string | null;
  shoot_date: string | null;
  lines: QuoteLineDraft[];
}

export interface QuoteSourceLead {
  name: string | null;
  offering_id: string | null;
  event_date: string | null;
}

export interface QuoteSourceJob {
  client_name: string | null;
  offering_id: string | null;
  package_name: string | null;
  price_minor: number | null;
  booked_starts_at: string | null;
}

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * A new quote from a lead or a shoot starts with its package as the first line, its shoot
 * date, and a "<package> – <client>" title. The shoot wins over the lead when both are given.
 */
export function quotePrefillFromSource(source: {
  lead?: QuoteSourceLead | null;
  job?: QuoteSourceJob | null;
  packages: QuotePackage[];
}): QuoteDraftPrefill {
  const { lead, job, packages } = source;
  const offeringId = job?.offering_id ?? lead?.offering_id ?? null;
  const pkg = offeringId ? packages.find((p) => p.id === offeringId) : undefined;
  const packageName = (job?.package_name ?? pkg?.name ?? '').trim();
  const priceMinor = job?.price_minor ?? pkg?.price_minor ?? null;
  const clientName = (job?.client_name ?? lead?.name ?? '').trim();

  const lines: QuoteLineDraft[] =
    offeringId && packageName && priceMinor != null
      ? [{
          offering_id: offeringId, description: packageName, qty: 1, unit_price_minor: priceMinor,
          is_optional: false, is_selected: true,
        }]
      : [];

  let shootDate: string | null = null;
  if (job?.booked_starts_at) {
    const when = new Date(job.booked_starts_at);
    shootDate = Number.isNaN(when.getTime()) ? null : isoDateInJerusalem(when);
  } else if (lead?.event_date) {
    shootDate = ISO_DATE_PREFIX.exec(lead.event_date)?.[1] ?? null;
  }

  const title = [packageName, clientName].filter(Boolean).join(' – ') || null;
  return { title, shoot_date: shootDate, lines };
}

export function newQuoteDraft(
  source: { leadId: string | null; engagementId: string | null },
  now = new Date(),
  prefill?: QuoteDraftPrefill,
): QuoteDraft {
  const validUntil = new Date(now.getTime() + DEFAULT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return {
    id: null,
    lead_id: source.leadId,
    engagement_id: source.engagementId,
    title: prefill?.title ?? null,
    shoot_date: prefill?.shoot_date ?? null,
    valid_until: isoDateInJerusalem(validUntil),
    notes: null,
    deposit_percent: DEFAULT_DEPOSIT_PERCENT,
    balance_max_installments: 1,
    send_contract_on_accept: false,
    lines: prefill?.lines ?? [],
  };
}

export function draftFromQuote(quote: QuoteDetail): QuoteDraft {
  return {
    id: quote.id,
    lead_id: quote.lead_id,
    engagement_id: quote.engagement_id,
    title: quote.title,
    shoot_date: quote.shoot_date,
    valid_until: quote.valid_until,
    notes: quote.notes,
    deposit_percent: quote.deposit_percent,
    balance_max_installments: quote.balance_max_installments,
    send_contract_on_accept: quote.send_contract_on_accept,
    lines: quote.lines.map((line) => ({
      offering_id: line.offering_id,
      description: line.description,
      qty: line.qty,
      unit_price_minor: line.unit_price_minor,
      is_optional: line.is_optional,
      is_selected: line.is_selected,
    })),
  };
}
