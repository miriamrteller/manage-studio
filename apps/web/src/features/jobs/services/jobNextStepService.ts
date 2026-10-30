import { safePayPath, safePortalPath } from '../lib/bookingFlowPaths';

/** Where a client goes after signing a job contract (job-next-step). */
export type JobNextStep =
  | { next: 'pay_deposit'; payPath: string; amountMinor: number; currency: string }
  | { next: 'portal'; portalPath: string };

/**
 * Asks the server for the next step, authorised by the same WaiverToken the
 * signing page was opened with. The pay link comes from the server only.
 */
export async function fetchJobNextStep(engagementId: string, waiverToken: string): Promise<JobNextStep> {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/job-next-step`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `WaiverToken ${waiverToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({ engagementId }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) throw new Error(typeof data.error === 'string' ? data.error : `job-next-step ${resp.status}`);

  if (data.next === 'pay_deposit') {
    const payPath = safePayPath(data.payPath);
    if (payPath && typeof data.amountMinor === 'number' && typeof data.currency === 'string') {
      return { next: 'pay_deposit', payPath, amountMinor: data.amountMinor, currency: data.currency };
    }
  }
  if (data.next === 'portal') {
    const portalPath = safePortalPath(data.portalPath);
    if (portalPath) return { next: 'portal', portalPath };
  }
  throw new Error('Unexpected job-next-step response');
}
