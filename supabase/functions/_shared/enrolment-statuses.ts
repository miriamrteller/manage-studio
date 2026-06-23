/** Keep in sync with apps/web/src/features/enrolment/lib/enrolmentTransitions.ts */
export const ENROLMENT_BLOCKING_DUPLICATE_STATUSES = [
  "pending_payment",
  "admin_review",
  "pending_offer",
  "active",
  "pending_waiver",
] as const;
