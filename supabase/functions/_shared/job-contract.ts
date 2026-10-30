import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Job contracts reuse the consent-template / waiver-evidence stack. The active
 * consent template is the contract; its `{{merge_fields}}` are rendered from
 * the job (client name, shoot date, location, package, price) on the server,
 * identically on display (get-waiver-engagement) and on signing
 * (accept-waiver), so wording_snapshot is exactly the text the client saw.
 */

export const JOB_CONTRACT_FIELDS = [
  "client_name",
  "shoot_date",
  "location",
  "package",
  "price",
] as const;
export type JobContractFieldKey = (typeof JOB_CONTRACT_FIELDS)[number];
export type JobContractFields = Record<JobContractFieldKey, string>;

const MERGE_FIELD = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Replace `{{field}}` tokens; unknown fields are left untouched so they stay visible. */
export function renderJobContract(content: string, fields: Partial<JobContractFields>): string {
  return content.replace(MERGE_FIELD, (token, rawKey: string) => {
    const key = rawKey.toLowerCase() as JobContractFieldKey;
    const value = fields[key];
    return value === undefined ? token : value;
  });
}

export function formatJobDate(iso: string | null, language: "he" | "en"): string {
  if (!iso) return language === "he" ? "טרם נקבע" : "To be scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(language === "he" ? "he-IL" : "en-GB", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export function formatJobPrice(priceMinor: number | null, currency: string | null, language: "he" | "en"): string {
  if (priceMinor === null) return "—";
  try {
    return new Intl.NumberFormat(language === "he" ? "he-IL" : "en-GB", {
      style: "currency",
      currency: currency ?? "ILS",
    }).format(priceMinor / 100);
  } catch {
    return `${(priceMinor / 100).toFixed(2)} ${currency ?? "ILS"}`;
  }
}

/**
 * Authenticated signing path: only the job's own account members (the client
 * household) or a tenant admin may sign. Guest links are scoped by token.
 */
export function canSignJobContract(params: {
  roles: string[];
  memberAccountIds: string[];
  jobAccountId: string | null;
}): boolean {
  const { roles, memberAccountIds, jobAccountId } = params;
  if (roles.includes("tenant_admin") || roles.includes("super_admin")) return true;
  if (!jobAccountId) return false;
  return memberAccountIds.includes(jobAccountId);
}

export interface JobContractContext {
  engagementId: string;
  personId: string;
  /** The client account (people.account_id of the primary contact). */
  accountId: string | null;
  offeringId: string;
  engagementStatus: string;
  waiverEvidenceId: string | null;
  jobStatus: string;
  clientEmail: string | null;
  fields: JobContractFields;
}

/**
 * Loads the job behind an engagement (null when the engagement is not a job,
 * i.e. has no job_details row) together with the rendered merge fields.
 */
export async function loadJobContractContext(
  service: SupabaseClient,
  params: { tenantId: string; engagementId: string; language: "he" | "en" },
): Promise<JobContractContext | null> {
  const { tenantId, engagementId, language } = params;

  const { data: job } = await service
    .from("job_details")
    .select("engagement_id, job_status, location")
    .eq("tenant_id", tenantId)
    .eq("engagement_id", engagementId)
    .maybeSingle();
  if (!job) return null;

  const { data: eng } = await service
    .from("engagements")
    .select("id, person_id, offering_id, status, waiver_evidence_id, booked_starts_at")
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();
  if (!eng) return null;

  const [{ data: person }, { data: offering }] = await Promise.all([
    service.from("people").select("name, email, account_id").eq("id", eng.person_id as string).eq("tenant_id", tenantId).maybeSingle(),
    service
      .from("offerings")
      .select("name, price_minor, currency, location")
      .eq("id", eng.offering_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const location = (job.location as string | null) ?? (offering?.location as string | null) ?? "—";

  return {
    engagementId: eng.id as string,
    personId: eng.person_id as string,
    accountId: (person?.account_id as string | null) ?? null,
    offeringId: eng.offering_id as string,
    engagementStatus: (eng.status as string) ?? "active",
    waiverEvidenceId: (eng.waiver_evidence_id as string | null) ?? null,
    jobStatus: job.job_status as string,
    clientEmail: (person?.email as string | null) ?? null,
    fields: {
      client_name: (person?.name as string | null) ?? "—",
      shoot_date: formatJobDate((eng.booked_starts_at as string | null) ?? null, language),
      location,
      package: (offering?.name as string | null) ?? "—",
      price: formatJobPrice((offering?.price_minor as number | null) ?? null, (offering?.currency as string | null) ?? null, language),
    },
  };
}
