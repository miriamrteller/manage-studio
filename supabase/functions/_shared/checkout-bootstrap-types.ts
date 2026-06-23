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
