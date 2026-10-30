import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { isJobPaymentRequestStatus, type JobPaymentRequestStatus } from "./payment-request-state.ts";

export interface JobPaymentRequestRow {
  id: string;
  tenant_id: string;
  engagement_id: string;
  label: string;
  amount_minor: number;
  currency: string;
  due_date: string | null;
  status: JobPaymentRequestStatus;
  payment_id: string | null;
  sent_at: string | null;
  paid_at: string | null;
  max_installments: number;
  public_token: string;
  due_reminder_sent_at: string | null;
  overdue_reminder_sent_at: string | null;
}

export const JOB_PAYMENT_REQUEST_COLUMNS =
  "id, tenant_id, engagement_id, label, amount_minor, currency, due_date, status, payment_id, " +
  "sent_at, paid_at, max_installments, public_token, due_reminder_sent_at, overdue_reminder_sent_at";

function coerceRow(data: Record<string, unknown>): JobPaymentRequestRow {
  const status = data.status;
  if (!isJobPaymentRequestStatus(status)) {
    throw new Error(`job_payment_requests: unknown status ${String(status)}`);
  }
  return { ...(data as unknown as JobPaymentRequestRow), status };
}

export async function loadJobPaymentRequestById(
  service: SupabaseClient,
  id: string,
): Promise<JobPaymentRequestRow | null> {
  const { data, error } = await service
    .from("job_payment_requests")
    .select(JOB_PAYMENT_REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? coerceRow(data as unknown as Record<string, unknown>) : null;
}

export async function loadJobPaymentRequestByToken(
  service: SupabaseClient,
  token: string,
): Promise<JobPaymentRequestRow | null> {
  const trimmed = token.trim();
  // Tokens are 48 hex chars (gen_random_bytes(24)); refuse anything else before hitting the DB.
  if (!/^[0-9a-f]{48}$/.test(trimmed)) return null;
  const { data, error } = await service
    .from("job_payment_requests")
    .select(JOB_PAYMENT_REQUEST_COLUMNS)
    .eq("public_token", trimmed)
    .maybeSingle();
  if (error) throw error;
  return data ? coerceRow(data as unknown as Record<string, unknown>) : null;
}

export async function listJobPaymentRequests(
  service: SupabaseClient,
  engagementId: string,
): Promise<JobPaymentRequestRow[]> {
  const { data, error } = await service
    .from("job_payment_requests")
    .select(JOB_PAYMENT_REQUEST_COLUMNS)
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(coerceRow);
}
