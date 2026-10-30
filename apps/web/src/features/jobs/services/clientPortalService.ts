import { z } from 'zod';
import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { JOB_STATUSES, type JobStatus } from './jobService';
import { JobPaymentService, type JobPaymentRequest } from './jobPaymentService';

/**
 * Read model for the photographer client portal (ClientPortal).
 *
 * Clients never select `job_details` (gallery_url / notes are admin-only):
 * shoot status + location come from the client-safe `client_job_details`
 * view, date / package / contract state from the client's own `engagements`
 * rows (RLS: own person or own account), and the gated gallery link only from
 * get_client_job_gallery().
 */

export interface ClientShoot {
  engagementId: string;
  personId: string;
  jobStatus: JobStatus;
  location: string | null;
  galleryReleased: boolean;
  bookedStartsAt: string | null;
  bookedEndsAt: string | null;
  engagementStatus: string;
  packageName: string | null;
  contractSigned: boolean;
}

const JobStatusSchema = z.enum(JOB_STATUSES);

const ClientJobDetailsRowSchema = z.object({
  engagement_id: z.string(),
  job_status: z.string(),
  location: z.string().nullable(),
  gallery_released: z.boolean().nullable(),
});

const ClientEngagementRowSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  status: z.string(),
  booked_starts_at: z.string().nullable(),
  booked_ends_at: z.string().nullable(),
  waiver_evidence_id: z.string().nullable(),
  offerings: z
    .union([
      z.object({ name: z.string().nullable(), location: z.string().nullable().optional() }),
      z.array(z.object({ name: z.string().nullable(), location: z.string().nullable().optional() })),
    ])
    .nullable()
    .optional(),
  people: z
    .union([
      z.object({ account_id: z.string().nullable() }),
      z.array(z.object({ account_id: z.string().nullable() })),
    ])
    .nullable()
    .optional(),
});

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Upcoming shoots first (soonest first), then undated, then past (most recent first). */
export function sortShoots(shoots: ClientShoot[], now: Date = new Date()): ClientShoot[] {
  const nowMs = now.getTime();
  const rank = (s: ClientShoot) => {
    if (!s.bookedStartsAt) return 1;
    return new Date(s.bookedStartsAt).getTime() >= nowMs ? 0 : 2;
  };
  return [...shoots].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = a.bookedStartsAt ? new Date(a.bookedStartsAt).getTime() : 0;
    const tb = b.bookedStartsAt ? new Date(b.bookedStartsAt).getTime() : 0;
    return ra === 2 ? tb - ta : ta - tb;
  });
}

export class ClientPortalService extends BaseService {
  /**
   * The signed-in client's shoots. `owner` narrows the result to the client's
   * own person / account, so a login that is also a tenant admin (for whom
   * the view returns every job) still sees only their own shoots here.
   */
  static async listShoots(
    tenantId: string,
    owner: { personId: string; accountId: string | null },
  ): Promise<ClientShoot[]> {
    return this.withRetry(async () => {
      const { data: jobRows, error: jobError } = await supabase
        .from('client_job_details')
        .select('engagement_id, job_status, location, gallery_released')
        .eq('tenant_id', tenantId);
      if (jobError) throw new Error(jobError.message);

      const jobs = (jobRows ?? []).map((row) => ClientJobDetailsRowSchema.parse(row));
      if (jobs.length === 0) return [];

      const { data: engagementRows, error: engagementError } = await supabase
        .from('engagements')
        .select(
          'id, person_id, status, booked_starts_at, booked_ends_at, waiver_evidence_id, offerings(name, location), people(account_id)',
        )
        .in(
          'id',
          jobs.map((j) => j.engagement_id),
        );
      if (engagementError) throw new Error(engagementError.message);

      const engagements = new Map(
        (engagementRows ?? [])
          .map((row) => ClientEngagementRowSchema.parse(row))
          .map((row) => [row.id, row] as const),
      );

      const shoots: ClientShoot[] = [];
      for (const job of jobs) {
        const eng = engagements.get(job.engagement_id);
        if (!eng) continue;
        const accountId = one(eng.people)?.account_id ?? null;
        const isOwn =
          eng.person_id === owner.personId || (owner.accountId !== null && accountId === owner.accountId);
        if (!isOwn) continue;
        const offering = one(eng.offerings);
        shoots.push({
          engagementId: eng.id,
          personId: eng.person_id,
          jobStatus: JobStatusSchema.catch('enquiry').parse(job.job_status),
          location: job.location ?? offering?.location ?? null,
          galleryReleased: Boolean(job.gallery_released),
          bookedStartsAt: eng.booked_starts_at,
          bookedEndsAt: eng.booked_ends_at,
          engagementStatus: eng.status,
          packageName: offering?.name ?? null,
          contractSigned: eng.waiver_evidence_id !== null,
        });
      }
      return sortShoots(shoots);
    }, 'ClientPortalService.listShoots');
  }

  /** Payment requests for the client's shoots (RLS: job_payment_requests_client_select). */
  static async listPaymentRequests(engagementIds: string[]): Promise<JobPaymentRequest[]> {
    if (engagementIds.length === 0) return [];
    return JobPaymentService.listForEngagements(engagementIds);
  }

  /**
   * Short-lived download link for the client's own signed contract PDF (edge
   * function job-contract-pdf-link: the server checks the shoot is theirs).
   */
  static async signedContractPdfUrl(engagementId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('job-contract-pdf-link', {
      body: { engagementId },
    });
    const parsed = await parseFunctionInvokeBody(data, error);
    if (error || (parsed && typeof parsed.error === 'string')) {
      throw new Error(functionInvokeErrorMessage(error, parsed, 'Could not download the contract'));
    }
    const url = (parsed ?? data)?.url;
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new Error('Could not download the contract');
    }
    return url;
  }

  /**
   * Fresh signing link for the client's own unsigned contract (edge function
   * client-job-contract-link). Returns an app-relative path to /enrol/complete.
   */
  static async contractSignPath(engagementId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('client-job-contract-link', {
      body: { engagementId },
    });
    const parsed = await parseFunctionInvokeBody(data, error);
    if (error || (parsed && typeof parsed.error === 'string')) {
      throw new Error(functionInvokeErrorMessage(error, parsed, 'Could not open the contract'));
    }
    const signPath = (parsed ?? data)?.signPath;
    if (typeof signPath !== 'string' || !signPath.startsWith('/enrol/complete?')) {
      throw new Error('Could not open the contract');
    }
    return signPath;
  }
}
