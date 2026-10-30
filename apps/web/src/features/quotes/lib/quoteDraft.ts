import type { QuoteDraft } from './quoteSchemas';
import type { QuoteDetail } from '../services/quoteService';

const DEFAULT_DEPOSIT_PERCENT = 30;
const DEFAULT_VALIDITY_DAYS = 14;

function isoDateInJerusalem(date: Date): string {
  // en-CA renders YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

export function newQuoteDraft(source: { leadId: string | null; engagementId: string | null }, now = new Date()): QuoteDraft {
  const validUntil = new Date(now.getTime() + DEFAULT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return {
    id: null,
    lead_id: source.leadId,
    engagement_id: source.engagementId,
    title: null,
    shoot_date: null,
    valid_until: isoDateInJerusalem(validUntil),
    notes: null,
    deposit_percent: DEFAULT_DEPOSIT_PERCENT,
    balance_max_installments: 1,
    send_contract_on_accept: false,
    lines: [],
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
