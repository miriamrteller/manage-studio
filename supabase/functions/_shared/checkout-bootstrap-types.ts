export type CheckoutBootstrapPhase = "load" | "pay";

export type PrepareEnrolmentCheckoutBody =
  | {
      phase: CheckoutBootstrapPhase;
      mode: "existing_engagement";
      engagement_id: string;
      offering_id?: string;
      enrolment_token?: string;
    }
  | {
      phase: "pay";
      mode: "create_engagement";
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
  /** Class price before the automatic class discount; set only when there is a discount. */
  listAmountMinor?: number | null;
  /** The automatic class discounts behind amountMinor. */
  discounts?: ClassDiscountLine[];
  /** From offering — drives "/ month" on checkout UI. */
  billingMode?: string | null;
  billingInterval?: string | null;
  /** paymentProvider 'offline' only: the studio's "pay at the studio" text, if written. */
  offlineInstructions?: string | null;
  /**
   * Set with paymentProvider 'offline' when the studio chose online payment but has not
   * connected it yet: parents see "the studio hasn't set up online payment yet", not an error.
   */
  onlinePaymentNotSetUp?: boolean;
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
  /** Class price before the automatic class discount; set only when there is a discount. */
  listAmountMinor?: number | null;
  /** The automatic class discounts behind amountMinor (sibling, extra class, early bird). */
  discounts?: ClassDiscountLine[];
  currency: string;
  billingMode?: string | null;
  billingInterval?: string | null;
  /** Set when this engagement is an appointment booking (booked_starts_at). */
  appointment?: AppointmentCalendarDetails | null;
}

export type BootstrapBlockReason =
  | "waiver_required"
  | "not_payable"
  | "already_complete"
  | "pending_waiver";

export interface PrepareEnrolmentCheckoutResponse {
  context: EnrolmentCompletionContext;
  charge: CheckoutChargePayload | null;
  blockReason?: BootstrapBlockReason;
}

export interface ClassDiscountLine {
  kind: "sibling" | "extra_class" | "early_bird";
  amountMinor: number;
}
