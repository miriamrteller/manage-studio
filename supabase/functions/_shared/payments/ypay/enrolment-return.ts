import { tenantBaseUrlFor } from "../../tenant-url.ts";

/**
 * YPay sends the parent to its own page (a full redirect), then back to the studio's
 * /enrol/return page, which waits for the verified callback. No token goes in these URLs.
 */
export async function ypayEnrolmentReturnUrls(
  // deno-lint-ignore no-explicit-any -- chained Postgrest builder; only awaited
  service: { from: (t: string) => any },
  tenantId: string,
  engagementId: string,
): Promise<{ success: string; failure: string }> {
  const base = await tenantBaseUrlFor(service, tenantId);
  const returnUrl = `${base}/enrol/return/${encodeURIComponent(engagementId)}`;
  return { success: `${returnUrl}?result=success`, failure: `${returnUrl}?result=failed` };
}
