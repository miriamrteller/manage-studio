import { z } from 'zod';
import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

/**
 * Jobs ("Shoots" for photographer tenants) — an engagements row plus its 1:1
 * job_details row (migration 20261030000100). Business state lives in
 * job_details.job_status; engagements.status stays active/cancelled.
 * Writes that touch several tables go through SECURITY DEFINER RPCs
 * (create_job, convert_lead_to_job); single-row edits use RLS directly.
 */

export const JOB_STATUSES = ['enquiry', 'booked', 'shot', 'editing', 'delivered', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  engagement_id: string;
  job_status: JobStatus;
  location: string | null;
  notes: string | null;
  lead_id: string | null;
  gallery_url: string | null;
  gallery_released_at: string | null;
  created_at: string;
  engagement_status: string;
  booked_starts_at: string | null;
  booked_ends_at: string | null;
  waiver_evidence_id: string | null;
  person_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  offering_id: string;
  package_name: string | null;
  price_minor: number | null;
  currency: string | null;
  contract_signed_at: string | null;
  /** Signed, but the PDF failed at signing — the admin can generate it from the shoot page. */
  contract_pdf_pending: boolean;
}

export interface JobPackage {
  id: string;
  name: string;
  duration_mins: number | null;
  price_minor: number;
  currency: string;
  location: string | null;
  is_public: boolean;
}

const JOB_SELECT =
  'engagement_id, job_status, location, notes, lead_id, gallery_url, gallery_released_at, contract_pdf_pending, created_at, ' +
  'engagements!inner(id, status, booked_starts_at, booked_ends_at, waiver_evidence_id, person_id, offering_id, ' +
  'people(name, email, contact_preferences(whatsapp_number)), offerings(name, price_minor, currency), waiver_evidence(signed_at))';

const JobStatusSchema = z.enum(JOB_STATUSES);

const JobCreateSchema = z.object({
  offering_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().max(200).nullable().optional(),
  client_email: z.string().trim().email().nullable().optional().or(z.literal('')),
  client_phone: z.string().trim().max(40).nullable().optional(),
  booked_starts_at: z.string().datetime({ offset: true }).nullable().optional(),
  booked_ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export type JobCreateInput = z.input<typeof JobCreateSchema>;

const JobDetailsUpdateSchema = z.object({
  job_status: JobStatusSchema.optional(),
  location: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  gallery_url: z.string().trim().url().nullable().optional().or(z.literal('')),
});
export type JobDetailsUpdateInput = z.input<typeof JobDetailsUpdateSchema>;

const ConvertLeadSchema = z.object({
  lead_id: z.string().uuid(),
  offering_id: z.string().uuid().nullable().optional(),
  booked_starts_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
});
export type ConvertLeadInput = z.input<typeof ConvertLeadSchema>;

function toRow(raw: Record<string, unknown>): JobRow {
  const eng = (raw.engagements ?? {}) as Record<string, unknown>;
  const person = (eng.people ?? null) as {
    name?: string;
    email?: string;
    contact_preferences?: { whatsapp_number?: string | null }[] | { whatsapp_number?: string | null } | null;
  } | null;
  const prefs = Array.isArray(person?.contact_preferences)
    ? person?.contact_preferences[0]
    : person?.contact_preferences;
  const offering = (eng.offerings ?? null) as { name?: string; price_minor?: number; currency?: string } | null;
  const evidence = (eng.waiver_evidence ?? null) as { signed_at?: string } | null;
  return {
    engagement_id: raw.engagement_id as string,
    job_status: JobStatusSchema.catch('enquiry').parse(raw.job_status),
    location: (raw.location as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    lead_id: (raw.lead_id as string | null) ?? null,
    gallery_url: (raw.gallery_url as string | null) ?? null,
    gallery_released_at: (raw.gallery_released_at as string | null) ?? null,
    created_at: raw.created_at as string,
    engagement_status: (eng.status as string) ?? 'active',
    booked_starts_at: (eng.booked_starts_at as string | null) ?? null,
    booked_ends_at: (eng.booked_ends_at as string | null) ?? null,
    waiver_evidence_id: (eng.waiver_evidence_id as string | null) ?? null,
    person_id: eng.person_id as string,
    client_name: person?.name ?? null,
    client_email: person?.email ?? null,
    client_phone: prefs?.whatsapp_number ?? null,
    offering_id: eng.offering_id as string,
    package_name: offering?.name ?? null,
    price_minor: offering?.price_minor ?? null,
    currency: offering?.currency ?? null,
    contract_signed_at: evidence?.signed_at ?? null,
    contract_pdf_pending: raw.contract_pdf_pending === true,
  };
}

function rpcId(data: unknown): string {
  const id = (data as { engagement_id?: unknown } | null)?.engagement_id;
  if (typeof id !== 'string') throw new Error('RPC did not return an engagement id');
  return id;
}

export class JobService extends BaseService {
  static async list(tenant: Tenant): Promise<JobRow[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('job_details')
        .select(JOB_SELECT)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toRow);
    }, 'JobService.list');
  }

  static async get(tenant: Tenant, engagementId: string): Promise<JobRow | null> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('job_details')
        .select(JOB_SELECT)
        .eq('tenant_id', tenant.id)
        .eq('engagement_id', engagementId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toRow(data as unknown as Record<string, unknown>) : null;
    }, 'JobService.get');
  }

  /** Packages = appointment-type offerings (duration, no weekly slot, no season). */
  static async listPackages(tenant: Tenant): Promise<JobPackage[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, name, duration_mins, price_minor, currency, location, is_public')
        .eq('tenant_id', tenant.id)
        .eq('offering_type', 'appointment')
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as JobPackage[];
    }, 'JobService.listPackages');
  }

  static async create(_tenant: Tenant, input: JobCreateInput): Promise<string> {
    const v = JobCreateSchema.parse(input);
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('create_job', {
        p_offering_id: v.offering_id,
        p_person_id: v.person_id ?? undefined,
        p_client_name: v.client_name || undefined,
        p_client_email: v.client_email || undefined,
        p_client_phone: v.client_phone || undefined,
        p_booked_starts_at: v.booked_starts_at ?? undefined,
        p_booked_ends_at: v.booked_ends_at ?? undefined,
        p_location: v.location || undefined,
        p_notes: v.notes || undefined,
      });
      if (error) throw new Error(error.message);
      return rpcId(data);
    }, 'JobService.create');
  }

  static async convertLead(_tenant: Tenant, input: ConvertLeadInput): Promise<string> {
    const v = ConvertLeadSchema.parse(input);
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('convert_lead_to_job', {
        p_lead_id: v.lead_id,
        p_offering_id: v.offering_id ?? undefined,
        p_booked_starts_at: v.booked_starts_at ?? undefined,
        p_location: v.location || undefined,
      });
      if (error) throw new Error(error.message);
      return rpcId(data);
    }, 'JobService.convertLead');
  }

  static async updateDetails(tenant: Tenant, engagementId: string, input: JobDetailsUpdateInput): Promise<void> {
    const v = JobDetailsUpdateSchema.parse(input);
    return this.withRetry(async () => {
      const patch: Record<string, unknown> = {};
      if (v.job_status !== undefined) patch.job_status = v.job_status;
      if (v.location !== undefined) patch.location = v.location || null;
      if (v.notes !== undefined) patch.notes = v.notes || null;
      if (v.gallery_url !== undefined) patch.gallery_url = v.gallery_url || null;
      const { error } = await supabase
        .from('job_details')
        .update(patch)
        .eq('engagement_id', engagementId)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(error.message);
      if (v.job_status === 'cancelled') {
        const { error: engError } = await supabase
          .from('engagements')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'admin_cancelled' })
          .eq('id', engagementId)
          .eq('tenant_id', tenant.id);
        if (engError) throw new Error(engError.message);
      }
      await this.logAudit(tenant, 'UPDATE', 'job_details', engagementId);
    }, 'JobService.updateDetails');
  }

  static async updateSchedule(
    tenant: Tenant,
    engagementId: string,
    schedule: { booked_starts_at: string | null; booked_ends_at: string | null },
  ): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await supabase
        .from('engagements')
        .update({ booked_starts_at: schedule.booked_starts_at, booked_ends_at: schedule.booked_ends_at })
        .eq('id', engagementId)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(error.message);
      await this.logAudit(tenant, 'UPDATE', 'engagements', engagementId);
    }, 'JobService.updateSchedule');
  }

  /**
   * Short-lived download link for the signed contract PDF (edge:
   * job-contract-pdf-link; server-side access check, private bucket).
   */
  static async signedContractPdfUrl(engagementId: string): Promise<{ url: string; expiresAt: string }> {
    const { data, error } = await supabase.functions.invoke('job-contract-pdf-link', {
      body: { engagementId },
    });
    if (error) throw new Error(error.message);
    const body = (data ?? {}) as { error?: string; url?: string; expiresAt?: string };
    if (body.error) throw new Error(body.error);
    if (typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) throw new Error('Could not prepare the download');
    return { url: body.url, expiresAt: body.expiresAt ?? '' };
  }

  /**
   * Admin retry when the PDF failed at signing (edge: job-contract-pdf-generate).
   * Renders from the sealed wording and returns a short-lived download link.
   */
  static async generateContractPdf(engagementId: string): Promise<{ url: string; expiresAt: string }> {
    const { data, error } = await supabase.functions.invoke('job-contract-pdf-generate', {
      body: { engagementId },
    });
    if (error) throw new Error(error.message);
    const body = (data ?? {}) as { error?: string; url?: string; expiresAt?: string };
    if (body.error) throw new Error(body.error);
    if (typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) throw new Error('Could not generate the PDF');
    return { url: body.url, expiresAt: body.expiresAt ?? '' };
  }

  /** Emails a tokenised contract-signing link (edge: send-job-contract-link). */
  static async sendContractLink(engagementId: string, recipientEmail: string): Promise<{ emailSent: boolean }> {
    const { data, error } = await supabase.functions.invoke('send-job-contract-link', {
      body: { engagementId, recipientEmail },
    });
    if (error) throw new Error(error.message);
    const body = (data ?? {}) as { error?: string; emailSent?: boolean };
    if (body.error) throw new Error(body.error);
    return { emailSent: Boolean(body.emailSent) };
  }
}
