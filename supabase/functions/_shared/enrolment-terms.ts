/**
 * Enrolment terms acceptance (docs/legal/09-in-app-consent-texts.md §1).
 * Pure helpers shared by accept-enrolment-terms and its tests.
 */
export const ENGAGEMENT_TERMS_ACCEPTED = "engagement.terms_accepted";

export type TermsAcceptedVia = "parent" | "guest_link" | "admin_attested";

/** Who ticked the box: a signed-in admin attests for the parent; a token holder is a guest. */
export function resolveTermsAcceptedVia(input: {
  authUserId: string | null;
  isTenantAdmin: boolean;
  tokenEmail: string | null;
}): TermsAcceptedVia {
  if (input.authUserId && input.isTenantAdmin) return "admin_attested";
  if (input.authUserId) return "parent";
  if (input.tokenEmail) return "guest_link";
  return "parent";
}

export function buildTermsAcceptancePatch(input: {
  via: TermsAcceptedVia;
  version: string;
  authUserId: string | null;
  tokenEmail: string | null;
  acceptedAt: string;
}) {
  return {
    terms_accepted_at: input.acceptedAt,
    terms_version: input.version,
    terms_accepted_by_user_id: input.authUserId,
    terms_accepted_by_email: input.tokenEmail,
    terms_accepted_via: input.via,
  };
}
