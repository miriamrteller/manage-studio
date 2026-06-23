import { supabase } from '@/lib/supabase';

export interface PipelinePaymentRow {
  id: string;
  status: string;
  charge_type: string;
  total_amount_minor: number;
  currency: string;
  external_document_id: string | null;
  external_document_number: string | null;
  invoice_url: string | null;
}

export interface PipelineQueueRow {
  status: string;
  attempts: number;
  last_error: string | null;
}

export interface PipelineRawInput {
  engagementStatus: string | null;
  payment: PipelinePaymentRow | null;
  queue: PipelineQueueRow | null;
  lastEmailAction: string | null;
}

export type PipelineStage =
  | 'no_engagement'
  | 'awaiting_payment'
  | 'paid_no_document'
  | 'document_pending'
  | 'document_failed'
  | 'complete';

export interface PipelineSummary {
  engagementStatus: string | null;
  paymentStatus: string | null;
  paymentId: string | null;
  queueStatus: string | null;
  documentIssued: boolean;
  documentNumber: string | null;
  documentUrl: string | null;
  lastEmailAction: string | null;
  stage: PipelineStage;
}

/**
 * Reduce the raw pipeline rows into a single stage the walkthrough panel can render.
 * Pure and deterministic so it can be unit-tested without Supabase.
 */
export function summarizePipeline(input: PipelineRawInput): PipelineSummary {
  const documentIssued = Boolean(input.payment?.external_document_id);
  const queueStatus = input.queue?.status ?? null;

  let stage: PipelineStage;
  if (!input.engagementStatus) {
    stage = 'no_engagement';
  } else if (!input.payment) {
    stage = 'awaiting_payment';
  } else if (documentIssued) {
    stage = 'complete';
  } else if (queueStatus === 'failed') {
    stage = 'document_failed';
  } else if (queueStatus === 'pending' || queueStatus === 'processing') {
    stage = 'document_pending';
  } else {
    stage = 'paid_no_document';
  }

  return {
    engagementStatus: input.engagementStatus,
    paymentStatus: input.payment?.status ?? null,
    paymentId: input.payment?.id ?? null,
    queueStatus,
    documentIssued,
    documentNumber: input.payment?.external_document_number ?? null,
    documentUrl: input.payment?.invoice_url ?? null,
    lastEmailAction: input.lastEmailAction,
    stage,
  };
}

/** Fetch the finance pipeline state for one engagement (RLS scopes to the admin's tenant). */
export async function fetchPipeline(engagementId: string): Promise<PipelineSummary> {
  const { data: engagement } = await supabase
    .from('engagements')
    .select('status')
    .eq('id', engagementId)
    .maybeSingle();

  const { data: payment } = await supabase
    .from('payments')
    .select(
      'id, status, charge_type, total_amount_minor, currency, external_document_id, external_document_number, invoice_url',
    )
    .eq('engagement_id', engagementId)
    .neq('charge_type', 'refund')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let queue: PipelineQueueRow | null = null;
  let lastEmailAction: string | null = null;

  if (payment?.id) {
    const { data: queueRow } = await supabase
      .from('document_queue')
      .select('status, attempts, last_error')
      .eq('payment_id', payment.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    queue = (queueRow as PipelineQueueRow | null) ?? null;
  }

  const { data: auditRow } = await supabase
    .from('audit_log')
    .select('action')
    .eq('entity_id', engagementId)
    .like('action', '%email%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  lastEmailAction = (auditRow?.action as string | undefined) ?? null;

  return summarizePipeline({
    engagementStatus: (engagement?.status as string | undefined) ?? null,
    payment: (payment as PipelinePaymentRow | null) ?? null,
    queue,
    lastEmailAction,
  });
}

export interface WalkthroughScenario {
  id: string;
  label: string;
  flow: string;
  howTo: string;
  link?: string;
}

/** Seed scenario matrix mirrored from supabase/seed-finance.sql (creativeballet tenant). */
export const WALKTHROUGH_SCENARIOS: WalkthroughScenario[] = [
  {
    id: 'a-card',
    label: 'Esther → Mini (301)',
    flow: 'A — parent card pay',
    howTo: 'Login parent miriamrstern@gmail.com, then pay the engagement.',
  },
  {
    id: 'a-adult',
    label: 'Sara → Pilates (309)',
    flow: 'A — adult self-pay',
    howTo: 'Guest or admin; waiver already signed.',
  },
  {
    id: 'b-recurring',
    label: 'Esther → Monthly Primary (310)',
    flow: 'B — recurring initial',
    howTo: 'Pay + save card + schedule.',
  },
  {
    id: 'e-refund',
    label: 'Ruti + payment 1101',
    flow: 'E — refund / parent receipt',
    howTo: 'Admin refund from the student slide-over; parent sees the receipt.',
  },
  {
    id: 'smoke',
    label: 'Finance Smoke ₪1 (311)',
    flow: 'A — cheapest happy path',
    howTo: 'No waiver; quickest end-to-end mock pay.',
  },
];
