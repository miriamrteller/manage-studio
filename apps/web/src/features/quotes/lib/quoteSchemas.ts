import { z } from 'zod';

/**
 * Input validation for quotes (Definition of Done: Zod on every new input).
 * Bounds mirror the CHECK constraints in 20261030000300_quotes.sql.
 */
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const AUTOMATIC_EMAIL_KEYS = [
  'quote_sent',
  'booking_confirmed',
  'shoot_reminder',
  'shoot_thank_you',
  'gallery_ready',
] as const;
export type AutomaticEmailKey = (typeof AUTOMATIC_EMAIL_KEYS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const quoteLineSchema = z.object({
  offering_id: z.string().uuid().nullable(),
  description: z.string().trim().min(1).max(500),
  qty: z.number().int().min(1).max(100),
  unit_price_minor: z.number().int().min(0).max(10_000_000),
  is_optional: z.boolean(),
  is_selected: z.boolean(),
});
export type QuoteLineDraft = z.infer<typeof quoteLineSchema>;

export const quoteDraftSchema = z
  .object({
    id: z.string().uuid().nullable(),
    lead_id: z.string().uuid().nullable(),
    engagement_id: z.string().uuid().nullable(),
    title: z.string().trim().max(200).nullable(),
    shoot_date: isoDate,
    valid_until: isoDate,
    notes: z.string().trim().max(5000).nullable(),
    deposit_percent: z.number().int().min(0).max(100),
    balance_max_installments: z.number().int().min(1).max(36),
    send_contract_on_accept: z.boolean(),
    lines: z.array(quoteLineSchema).min(1).max(100),
  })
  .refine((q) => q.lead_id !== null || q.engagement_id !== null, {
    message: 'A quote needs a lead or a shoot',
    path: ['lead_id'],
  });
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;

export const publicAcceptSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  tenantId: z.string().uuid(),
  selectedLineIds: z.array(z.string().uuid()).max(100),
});
export type PublicAcceptInput = z.infer<typeof publicAcceptSchema>;

/** Major-unit text input ("1,250.50") → minor units; null when invalid. */
export function parseMajorToMinor(value: string): number | null {
  const cleaned = value.replace(/[,\s₪]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
