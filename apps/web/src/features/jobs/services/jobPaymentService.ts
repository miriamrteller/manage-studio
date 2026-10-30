import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * Job (shoot) deposit/balance payment requests — thin client over
 * `job_payment_requests` (RLS: tenant admins manage, clients read their own)
 * plus the admin edge functions. Money never moves from here directly: charges,
 * manual payments and refunds all go through edge functions that write the
 * ledger (payments + audit_log) deterministically.
 */

export const JOB_PAYMENT_REQUEST_STATUSES = [
  'pending',
  'sent',
  'paid',
  'cancelled',
  'refunded_manual',
] as const;
export type JobPaymentRequestStatus = (typeof JOB_PAYMENT_REQUEST_STATUSES)[number];

export interface JobPaymentRequest {
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
  refunded_at: string | null;
  created_at: string;
  /** Joined from payments (admin only): invoice link + method for the paid row. */
  payment?: {
    id: string;
    payment_method: string | null;
    invoice_url: string | null;
    external_document_number: string | null;
    status: string;
  } | null;
}

export interface JobPaymentRequestInput {
  label: string;
  amount_minor: number;
  due_date?: string | null;
  max_installments?: number;
}

export interface JobGalleryState {
  engagement_id: string;
  released: boolean;
  released_by_admin: boolean;
  all_paid: boolean;
  outstanding_minor: number;
  has_gallery: boolean;
  gallery_url: string | null;
}

const COLUMNS =
  'id, tenant_id, engagement_id, label, amount_minor, currency, due_date, status, payment_id, ' +
  'sent_at, paid_at, max_installments, public_token, refunded_at, created_at, ' +
  'payment:payments!job_payment_requests_payment_id_fkey(id, payment_method, invoice_url, external_document_number, status)';

async function invoke<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  const parsed = await parseFunctionInvokeBody(data, error);
  if (error || (parsed && typeof parsed.error === 'string')) {
    throw new Error(functionInvokeErrorMessage(error, parsed, fallback));
  }
  return (parsed ?? data) as T;
}

export class JobPaymentService extends BaseService {
  static async list(engagementId: string): Promise<JobPaymentRequest[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('job_payment_requests')
        .select(COLUMNS)
        .eq('engagement_id', engagementId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as JobPaymentRequest[];
    }, 'JobPaymentService.list');
  }

  /** Same RPC Thread C calls from an accepted quote. */
  static async create(engagementId: string, requests: JobPaymentRequestInput[]): Promise<JobPaymentRequest[]> {
    const { data, error } = await supabase.rpc('create_job_payment_requests', {
      p_engagement_id: engagementId,
      p_requests: requests.map((r) => ({
        label: r.label.trim(),
        amount_minor: r.amount_minor,
        due_date: r.due_date ?? null,
        max_installments: r.max_installments ?? 1,
      })),
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as JobPaymentRequest[];
  }

  static async update(
    id: string,
    patch: Partial<Pick<JobPaymentRequest, 'label' | 'amount_minor' | 'due_date' | 'max_installments'>>,
  ): Promise<void> {
    const { error } = await supabase.from('job_payment_requests').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  static async setStatus(id: string, status: 'cancelled' | 'pending'): Promise<void> {
    const { error } = await supabase.from('job_payment_requests').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  static async sendLink(id: string): Promise<{ recipientEmail: string; paymentUrl: string }> {
    return invoke('send-job-payment-link', { request_id: id }, 'Could not send the payment link');
  }

  static async recordManualPayment(
    id: string,
    method: 'cash' | 'bank_transfer',
    note?: string,
  ): Promise<{ paymentId: string }> {
    return invoke('record-job-payment', { request_id: id, method, note }, 'Could not record the payment');
  }

  static async recordManualRefund(paymentId: string, reason?: string): Promise<{ refundPaymentId: string }> {
    return invoke(
      'process-refund',
      { payment_id: paymentId, reason, manual: true },
      'Could not record the refund',
    );
  }

  static async getGallery(engagementId: string): Promise<JobGalleryState> {
    const { data, error } = await supabase.rpc('get_client_job_gallery', { p_engagement_id: engagementId });
    if (error) throw new Error(error.message);
    return data as JobGalleryState;
  }

  static async releaseGallery(engagementId: string, release: boolean): Promise<JobGalleryState> {
    const { data, error } = await supabase.rpc('release_job_gallery', {
      p_engagement_id: engagementId,
      p_release: release,
    });
    if (error) throw new Error(error.message);
    return data as JobGalleryState;
  }

  /** Public pay page (no session). */
  static async publicRequest(
    token: string,
    action: 'get' | 'create_charge' | 'status' = 'get',
  ): Promise<{ request: PublicJobPaymentRequest; pageUrl?: string }> {
    return invoke('job-payment-request-public', { token, action }, 'Payment request unavailable');
  }

  static payUrlFor(token: string): string {
    return `${window.location.origin}/pay/${encodeURIComponent(token)}`;
  }
}

export interface PublicJobPaymentRequest {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  dueDate: string | null;
  status: JobPaymentRequestStatus;
  paidAt: string | null;
  maxInstallments: number;
  jobDate: string | null;
  jobCancelled: boolean;
  studio: {
    name: string;
    language: 'he' | 'en';
    primaryColor: string | null;
    accentColor: string | null;
    logoUrl: string | null;
  };
  paymentProvider: string;
}
