// Keep in sync with supabase/functions/_shared/checkout-bootstrap-types.ts

export type CheckoutBootstrapPhase = 'load' | 'pay';

export type PrepareEnrolmentCheckoutBody =
  | {
      phase: CheckoutBootstrapPhase;
      mode: 'existing_engagement';
      engagement_id: string;
      offering_id?: string;
      enrolment_token?: string;
    }
  | {
      phase: 'pay';
      mode: 'create_engagement';
      person_id: string;
      offering_id: string;
      season_id: string;
      waiver_evidence_id?: string;
      age_override_confirmed?: boolean;
      age_override_reason?: string | null;
    };

export interface CheckoutChargePayload {
  clientSecret: string | null;
  paymentIntentId: string | null;
  publishableKey: string | null;
  amountMinor: number | null;
  currency: string | null;
  paymentProvider: string | null;
  mockCompleted: boolean;
  mockPending: boolean;
  alreadyPaid: boolean;
  pageUrl: string | null;
  pendingWebhook: boolean;
  /** From offering — drives "/ month" on checkout UI. */
  billingMode?: string | null;
  billingInterval?: string | null;
}

export interface AppointmentCalendarDetails {
  startsAt: string;
  endsAt: string;
  serviceName: string;
  location: string | null;
  schoolName: string;
}

export interface EnrolmentCompletionContext {
  engagementId: string;
  personId: string;
  offeringId: string;
  tenantId: string;
  status: string;
  alreadyComplete: boolean;
  studentName: string;
  className: string;
  waiverRequired: boolean;
  waiverAlreadySigned: boolean;
  waiverEvidenceId: string | null;
  template: Record<string, unknown> | null;
  isMinorStudent: boolean;
  amountMinor: number;
  currency: string;
  billingMode?: string | null;
  billingInterval?: string | null;
  /** Set when this engagement is an appointment booking (booked_starts_at). */
  appointment?: AppointmentCalendarDetails | null;
}

export type BootstrapBlockReason =
  | 'waiver_required'
  | 'not_payable'
  | 'already_complete'
  | 'pending_waiver';

export interface PrepareEnrolmentCheckoutResponse {
  context: EnrolmentCompletionContext;
  charge: CheckoutChargePayload | null;
  blockReason?: BootstrapBlockReason;
}

/** Map bootstrap charge to CheckoutIntentState fields used by payment shells. */
export function chargeToCheckoutIntent(charge: CheckoutChargePayload) {
  return {
    clientSecret: charge.clientSecret,
    publishableKey: charge.publishableKey,
    paymentProvider: charge.paymentProvider,
    mockCompleted: charge.mockCompleted,
    mockPending: charge.mockPending,
    amountMinor: charge.amountMinor,
    currency: charge.currency,
    mockPaymentRef: charge.paymentIntentId,
    pageUrl: charge.pageUrl,
    pendingWebhook: charge.pendingWebhook,
    billingMode: charge.billingMode ?? null,
    billingInterval: charge.billingInterval ?? null,
  };
}
