import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { loginAsParent as loginAsParentAuth, SEED_USERS } from './auth';

/** Seeded finance fixtures on creativeballet (see supabase/seed-finance.sql). */
export const FINANCE_SEED = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  /** Esther → Mini Ballet — pending_payment with waiver already signed. */
  engagementId: '00000000-0000-0000-0000-000000001001',
  offeringId: '00000000-0000-0000-0000-000000000301',
  parentEmail: SEED_USERS.parentEmail,
  parentPassword: SEED_USERS.password,
  successCard: '4580458045804580',
  declineCard: '4580000000000000',
} as const;

export function financeDevEnabled(): boolean {
  return process.env.PLAYWRIGHT_FINANCE_DEV === '1';
}

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value || value === '...' || value.includes('your-project')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function requireFinanceDevEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isValidSupabaseUrl(url)) {
    throw new Error(
      'Missing or invalid Supabase URL. Add SUPABASE_URL or VITE_SUPABASE_URL to repo-root .env or apps/web/.env.local (not the literal "...").',
    );
  }
  if (!serviceRoleKey || serviceRoleKey === '...' || serviceRoleKey.includes('your-')) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Add it to repo-root .env (Dashboard → Project Settings → API → service_role).',
    );
  }
  return { url, serviceRoleKey };
}

export function createFinanceAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = requireFinanceDevEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Reset a seeded engagement back to pending_payment so payment E2E can run repeatedly. */
export async function resetPendingPaymentEngagement(
  engagementId: string = FINANCE_SEED.engagementId,
): Promise<void> {
  const admin = createFinanceAdminClient();

  const { data: payments } = await admin
    .from('payments')
    .select('id')
    .eq('engagement_id', engagementId);

  const paymentIds = (payments ?? []).map((p) => p.id as string);
  if (paymentIds.length > 0) {
    await admin.from('document_queue').delete().in('payment_id', paymentIds);
    await admin.from('payments').delete().in('id', paymentIds);
  }

  const { error } = await admin
    .from('engagements')
    .update({
      status: 'pending_payment',
      billing_status: null,
      payment_received_at: null,
    })
    .eq('id', engagementId);

  if (error) {
    throw new Error(`Failed to reset engagement ${engagementId}: ${error.message}`);
  }
}

export async function loginAsParent(page: Page, thenNavigateTo?: string): Promise<void> {
  await loginAsParentAuth(page, thenNavigateTo);
}

export async function waitForConfirmationEmailAudit(
  paymentId: string,
  timeoutMs = 30_000,
): Promise<{ action: string; after_state: Record<string, unknown> }> {
  const admin = createFinanceAdminClient();
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data: rows } = await admin
      .from('audit_log')
      .select('action, after_state')
      .eq('entity_type', 'payment')
      .eq('entity_id', paymentId)
      .in('action', [
        'payment_confirmation_email_sent',
        'payment_confirmation_email_failed',
        'payment_confirmation_email_skipped',
      ])
      .order('created_at', { ascending: false })
      .limit(1);

    const row = rows?.[0];
    if (row) {
      return {
        action: row.action as string,
        after_state: (row.after_state ?? {}) as Record<string, unknown>,
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error(`Timed out waiting for confirmation email audit on payment ${paymentId}`);
}

export async function latestPaymentIdForEngagement(engagementId: string): Promise<string | null> {
  const admin = createFinanceAdminClient();
  const { data } = await admin
    .from('payments')
    .select('id')
    .eq('engagement_id', engagementId)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
