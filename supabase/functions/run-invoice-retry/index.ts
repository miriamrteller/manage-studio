/**
 * run-invoice-retry — pg_cron edge function
 *
 * Runs every minute via pg_cron (same pattern as run-enrolment-payment-dunning).
 * Processes invoice_retry_queue for failed allocation attempts (SHAAM unavailable).
 *
 * Backoff schedule (spec §4d):
 *   Attempt 1: immediate
 *   Attempt 2: +5 minutes
 *   Attempt 3: +15 minutes
 *   Attempt 4: +1 hour
 *   Attempt 5: +4 hours
 *   After attempt 5: dead-letter (ops alert)
 *
 * Dead-letter: sets dead_lettered_at, surfaces warning to tenant dashboard.
 * T-33: Each retry uses invoice_id as idempotency key on the Yesh allocation call.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { providerForInvoicing, SupabaseVaultResolver } from '../_shared/payments/providers/index.ts';
import type { TenantProviderConfig } from '../_shared/payments/providers/types.ts';

const BACKOFF_MINUTES = [0, 5, 15, 60, 240];  // indexed by attempt_count (0-based)
const MAX_ATTEMPTS    = 5;

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const secretResolver = new SupabaseVaultResolver(supabase);

  // Fetch all due retries (not dead-lettered, next_retry_at <= NOW)
  const { data: dueEntries, error } = await supabase
    .from('invoice_retry_queue')
    .select(`
      id, invoice_id, tenant_id, attempt_count, next_retry_at, last_error_code,
      invoices!inner(yesh_docnum, b2b_flag, status)
    `)
    .is('dead_lettered_at', null)
    .lte('next_retry_at', new Date().toISOString())
    .limit(50);

  if (error) {
    console.error('Failed to fetch retry queue:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!dueEntries?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const entry of dueEntries) {
    try {
      // Resolve tenant config
      const { data: tenantRows } = await supabase
        .from('tenant_configs')
        .select('id, payment_provider, invoicing_provider, rapyd_config, yesh_config')
        .eq('id', entry.tenant_id)
        .eq('is_active', true)
        .limit(1);

      if (!tenantRows?.length) continue;

      const tenant = tenantRows[0] as TenantProviderConfig;
      const invoicingProvider = await providerForInvoicing(tenant, secretResolver);

      const invoice = (entry as { invoices: { yesh_docnum: string; b2b_flag: boolean } }).invoices;
      if (!invoice.yesh_docnum || !invoice.b2b_flag) {
        // Nothing to retry — remove from queue
        await supabase.from('invoice_retry_queue').delete().eq('id', entry.id);
        continue;
      }

      // Retry allocation (T-33: invoice_id is the natural idempotency key)
      const allocResp = await invoicingProvider.createITAAllocation(invoice.yesh_docnum);

      if (allocResp.allocationNumber) {
        // Success — update invoice and remove from retry queue
        await supabase.from('invoices').update({
          allocation_number:      allocResp.allocationNumber,
          allocation_status:      'obtained',
          allocation_skip_reason: null,
          updated_at:             new Date().toISOString(),
        }).eq('id', entry.invoice_id);

        await supabase.from('invoice_retry_queue').delete().eq('id', entry.id);
        successCount++;
      } else {
        await incrementRetryOrDeadLetter(supabase, entry);
        failureCount++;
      }
    } catch (err) {
      console.error(`Retry failed for entry ${entry.id}:`, err);
      await incrementRetryOrDeadLetter(supabase, entry);
      failureCount++;
    }
  }

  return new Response(
    JSON.stringify({ processed: dueEntries.length, succeeded: successCount, failed: failureCount }),
    { status: 200 }
  );
});

async function incrementRetryOrDeadLetter(
  supabase: ReturnType<typeof createClient>,
  entry:    { id: string; invoice_id: string; tenant_id: string; attempt_count: number }
): Promise<void> {
  const newAttemptCount = entry.attempt_count + 1;

  if (newAttemptCount >= MAX_ATTEMPTS) {
    // Dead-letter
    await supabase.from('invoice_retry_queue').update({
      attempt_count:   newAttemptCount,
      dead_lettered_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }).eq('id', entry.id);

    // Update invoice to show persistent error
    await supabase.from('invoices').update({
      allocation_status:     'error',
      updated_at:            new Date().toISOString(),
    }).eq('id', entry.invoice_id);

    console.error(`Dead-lettered invoice retry. invoice_id=${entry.invoice_id}, tenant_id=${entry.tenant_id}`);
    return;
  }

  // Schedule next retry with exponential backoff
  const backoffMinutes = BACKOFF_MINUTES[newAttemptCount] ?? 240;
  const nextRetryAt    = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

  await supabase.from('invoice_retry_queue').update({
    attempt_count:   newAttemptCount,
    next_retry_at:   nextRetryAt,
    last_error_code: 'SHAAM_UNAVAILABLE',
    updated_at:      new Date().toISOString(),
  }).eq('id', entry.id);
}
