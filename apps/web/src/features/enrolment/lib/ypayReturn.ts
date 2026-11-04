/**
 * YPay class checkout goes to YPay's own page (a full redirect) and comes back to
 * /enrol/return/:engagementId. A guest's enrolment link token is kept in this tab's
 * sessionStorage for the return, so it is never put in a URL sent to YPay.
 */

const tokenKey = (engagementId: string) => `ypayReturnToken:${engagementId}`;

export function rememberYpayReturnToken(engagementId: string, token: string | undefined): void {
  try {
    if (token) sessionStorage.setItem(tokenKey(engagementId), token);
    else sessionStorage.removeItem(tokenKey(engagementId));
  } catch {
    // Storage blocked: the return page falls back to the signed-in session.
  }
}

export function readYpayReturnToken(engagementId: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(engagementId));
  } catch {
    return null;
  }
}

/** Back to the class payment page, to try again with a new YPay page. */
export function enrolPayPath(engagementId: string, token: string | null): string {
  const base = `/enrol/pay/${encodeURIComponent(engagementId)}`;
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}
