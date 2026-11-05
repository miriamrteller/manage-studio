import { z } from "npm:zod@4.6.7";

export const ChargeMetadataSchema = z.object({
  tenant_id: z.string().guid(),
  engagement_id: z.string().guid(),
  billing_account_id: z.string().guid(),
  charge_type: z.enum(["initial", "renewal"]),
  billing_schedule_id: z.string().guid().optional(),
  offering_id: z.string().guid().optional(),
  person_id: z.string().guid().optional(),
  vat_rate: z.string().optional(),
  pretax_amount_minor: z.string().optional(),
  vat_amount_minor: z.string().optional(),
  total_amount_minor: z.string().optional(),
  /** "1": save the card used for this charge for later renewals (card link, payments B b). */
  save_card: z.literal("1").optional(),
});

export type ChargeMetadata = z.infer<typeof ChargeMetadataSchema>;

export interface ChargeParams {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  metadata: ChargeMetadata;
  savedToken?: string;
  customerRef?: string;
  /** Ask the hosted page to save the card for renewals (Grow saveCardToken), not only on a first charge. */
  saveCard?: boolean;
  installments?: number; // GAP 1: number of installments (1–12); defaults to 1
  /**
   * Tax-document line for providers that issue the document bundled with the
   * charge (YPay docType 109). Defaults to the enrolment wording when absent.
   */
  lineItem?: { name: string; description?: string };
  /**
   * Takbull only: pay with Bit (PaymentMethodType 21) instead of a card. On a phone
   * (isMobile) Takbull answers with a link that opens the Bit app.
   */
  payWith?: "bit";
  isMobile?: boolean;
  /** Hosted-page return URLs; defaults to the enrolment completion pages. */
  returnUrls?: { success: string; failure: string };
}

export interface ChargeResult {
  clientSecret?: string;
  providerPaymentRef: string;
  customerRef?: string;
  /** Hosted-page providers (Grow): URL the frontend opens; result is confirmed by webhook. */
  pageUrl?: string;
  /** True when the charge completes asynchronously via webhook (no inline finalise). */
  pendingWebhook?: true;
  /** Mock sync path — caller should invoke handlePaymentEventInternal when true. */
  emitSyncEvent?: PaymentEvent;
}

export interface PaymentEvent {
  type: "payment.succeeded" | "payment.failed";
  providerPaymentRef: string;
  metadata: ChargeMetadata;
  amountMinor: number;
  currency: string;
  pretaxAmountMinor: number;
  vatAmountMinor: number;
  vatRate: number;
  offeringId?: string;
  personId?: string;
  failureMessage?: string;
}

export interface PaymentProvider {
  readonly slug: string;
  createCharge(params: ChargeParams): Promise<ChargeResult>;
  /** Saved-card / standing-order charge (renewals). Optional until provider implements API v3 cc/bill. */
  chargeWithToken?(params: ChargeParams): Promise<ChargeResult>;
  constructEvent(rawBody: string, headers: Headers, tenantId: string): Promise<PaymentEvent>;
  saveCard?(params: {
    customerRef: string;
    paymentMethodId: string;
  }): Promise<{
    token: string;
    cardBrand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }>;
  refundCharge?(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }>;
}

export interface FinalisePaymentParams {
  tenantId: string;
  paymentRow: { id: string; engagement_id: string | null; charge_type: string };
  engagementId: string;
  chargeType: "initial" | "renewal";
  billingScheduleId?: string;
  actorUserId?: string | null;
  skipDocumentEnqueue?: boolean;
  /**
   * Renewal recorded by hand for one month (YYYY-MM, the schedule's due month): the schedule
   * moves on exactly one month if that month is still the one due, so paying ahead works and
   * a retry never moves it twice.
   */
  paidForPeriod?: string;
}
