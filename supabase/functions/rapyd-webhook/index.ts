/**
 * rapyd-webhook — inbound Rapyd webhook handler
 *
 * Validation sequence (spec §4):
 *  1. Signature verification (HMAC-SHA256)
 *  2. Timestamp replay-attack check (> 60s → reject)
 *  3. Idempotency check (duplicate → HTTP 200 immediately)
 *  4. Tenant isolation check (cross-tenant → HTTP 403)
 *  5. Insert webhook_events record (outcome = 'processing')
 *  6. Return HTTP 200 immediately (< 30s requirement)
 *  7. Async: createInvoice → createITAAllocation (if B2B) → sendSMS → mark fully_invoiced
 *
 * Error codes (§6.1): SIGNATURE_MISMATCH, WEBHOOK_REPLAY_ATTACK, DUPLICATE_WEBHOOK,
 *   CROSS_TENANT_ATTEMPT, PAYMENT_PROVIDER_UNAVAILABLE, SHAAM_UNAVAILABLE
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RapydAdapter }         from '../_shared/payments/providers/rapyd.ts';
import { YeshInvoiceAdapter }   from '../_shared/payments/providers/yesh.ts';
import { providerForPayment, providerForInvoicing, SupabaseVaultResolver } from '../_shared/payments/providers/index.ts';
import type { RapydWebhookPayload, TenantProviderConfig } from '../_shared/payments/providers/types.ts';

const WEBHOOK_URL_PATH = '/functions/v1/rapyd-webhook';
const REPLAY_WINDOW_SECONDS = 60;

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const secretResolver = new SupabaseVaultResolver(supabase);
  const operationId    = crypto.randomUUID();

  // ── Read raw body (needed for signature verification) ─────────────────────
  const bodyString = await req.text();
  let raw: RapydWebhookPayload;

  try {
    raw = JSON.parse(bodyString) as RapydWebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'INVALID_JSON', request_id: operationId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Extract webhook headers ───────────────────────────────────────────────
  const salt      = req.headers.get('salt')      ?? '';
  const timestamp = req.headers.get('timestamp') ?? '';
  const signature = req.headers.get('signature') ?? '';

  // ── 1. Replay-attack check FIRST (cheap, no DB) ───────────────────────────
  const tsSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (isNaN(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > REPLAY_WINDOW_SECONDS) {
    return new Response(
      JSON.stringify({ error: 'WEBHOOK_REPLAY_ATTACK', request_id: operationId }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── 2. Resolve tenant from access_key ─────────────────────────────────────
  const accessKey = req.headers.get('access_key') ?? '';
  const { data: tenantRows } = await supabase
    .from('tenant_configs')
    .select('id, payment_provider, invoicing_provider, rapyd_config, yesh_config')
    .filter('rapyd_config->>access_key', 'eq', accessKey)
    .eq('is_active', true)
    .limit(1);

  if (!tenantRows?.length) {
    return new Response(
      JSON.stringify({ error: 'TENANT_NOT_FOUND', request_id: operationId }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tenant = tenantRows[0] as TenantProviderConfig;
  const paymentProvider = await providerForPayment(tenant, secretResolver) as RapydAdapter;

  // ── 3. Signature verification ──────────────────────────────────────────────
  const signatureValid = await paymentProvider.verifyWebhookSignature(
    WEBHOOK_URL_PATH, salt, timestamp, bodyString, signature
  );

  if (!signatureValid) {
    await supabase.from('webhook_events').insert({
      idempotency_key: `${raw.data?.id ?? 'unknown'}_${raw.type}_failed_sig`,
      rapyd_event_type: raw.type,
      outcome:          'rejected_signature',
      raw_payload:      raw,
    });
    return new Response(
      JSON.stringify({ error: 'SIGNATURE_MISMATCH', request_id: operationId }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── 4. Tenant isolation check ─────────────────────────────────────────────
  const payloadTenantId = String(raw.data?.metadata?.['tenant_id'] ?? '');
  if (payloadTenantId && payloadTenantId !== tenant.id) {
    await supabase.from('webhook_events').insert({
      idempotency_key:  `${raw.data?.id}_${raw.type}_cross_tenant`,
      rapyd_event_type: raw.type,
      outcome:          'rejected_cross_tenant',
      raw_payload:      raw,
    });
    console.error(`SECURITY: cross-tenant attempt. Auth tenant: ${tenant.id}, payload tenant: ${payloadTenantId}`);
    return new Response(
      JSON.stringify({ error: 'CROSS_TENANT_ATTEMPT', request_id: operationId }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── 5. Idempotency check ──────────────────────────────────────────────────
  const idempotencyKey = `${raw.data?.id}_${raw.type}`;
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, outcome')
    .eq('idempotency_key', idempotencyKey)
    .limit(1);

  if (existing?.length) {
    if (existing[0].outcome === 'processed') {
      return new Response(
        JSON.stringify({ status: 'received', operation_id: operationId, note: 'DUPLICATE_WEBHOOK' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: 'CONFLICTING_PROCESSING_STATE', request_id: operationId }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── 6. Record webhook as processing and return 200 immediately ────────────
  await supabase.from('webhook_events').insert({
    idempotency_key:  idempotencyKey,
    rapyd_event_type: raw.type,
    outcome:          'processing',
    raw_payload:      raw,
  });

  // Return HTTP 200 before async processing (spec §4f: < 30s requirement)
  const response = new Response(
    JSON.stringify({ status: 'received', operation_id: operationId }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

  // ── 7. Async business logic ───────────────────────────────────────────────
  EdgeRuntime.waitUntil(processWebhook(supabase, secretResolver, tenant, raw, idempotencyKey));

  return response;
});

async function processWebhook(
  supabase:        ReturnType<typeof createClient>,
  secretResolver:  SupabaseVaultResolver,
  tenant:          TenantProviderConfig,
  raw:             RapydWebhookPayload,
  idempotencyKey:  string
): Promise<void> {
  try {
    const eventType = raw.type;

    // Only act on payment events that require invoice creation
    if (
      eventType !== 'PAYMENT.SUCCEEDED' &&
      eventType !== 'PAYMENT.SUBSCRIPTION.PAID'
    ) {
      // Refunds handled separately
      if (eventType === 'PAYMENT.REFUND.COMPLETED') {
        await handleRefundEvent(supabase, raw);
      }
      await supabase.from('webhook_events')
        .update({ outcome: 'processed', processed_at: new Date().toISOString() })
        .eq('idempotency_key', idempotencyKey);
      return;
    }

    const invoicingProvider = await providerForInvoicing(tenant, secretResolver);
    const paymentData = raw.data;

    // Lookup or create invoice record
    const { data: invoiceRows } = await supabase
      .from('invoices')
      .select('id, status, b2b_flag, rapyd_payment_id')
      .eq('rapyd_payment_id', paymentData.id)
      .eq('tenant_id', tenant.id)
      .limit(1);

    let invoiceId: string;
    let b2bFlag = false;

    if (invoiceRows?.length) {
      invoiceId = invoiceRows[0].id;
      b2bFlag   = invoiceRows[0].b2b_flag;

      // Update status to payment_confirmed
      await supabase.from('invoices')
        .update({ status: 'payment_confirmed', updated_at: new Date().toISOString() })
        .eq('id', invoiceId);
    } else {
      // Create new invoice record (b2b_flag derived from metadata — never from amount)
      b2bFlag = Boolean(paymentData.metadata?.['b2b_flag'] ?? false);
      const { data: newInvoice } = await supabase.from('invoices').insert({
        tenant_id:        tenant.id,
        rapyd_payment_id: paymentData.id,
        amount:           paymentData.amount,
        currency:         paymentData.currency,
        status:           'payment_confirmed',
        b2b_flag:         b2bFlag,
        client_name:      String(paymentData.metadata?.['client_name'] ?? ''),
        client_phone:     String(paymentData.metadata?.['client_phone'] ?? ''),
        line_items:       paymentData.metadata?.['line_items'] ?? [],
      }).select('id').single();

      if (!newInvoice) throw new Error('Failed to create invoice record');
      invoiceId = newInvoice.id;
    }

    // Create Yesh invoice
    const invoiceResp = await invoicingProvider.createInvoice({
      tenantId:    tenant.id,
      clientName:  String(paymentData.metadata?.['client_name'] ?? ''),
      clientPhone: String(paymentData.metadata?.['client_phone'] ?? ''),
      clientEmail: String(paymentData.metadata?.['client_email'] ?? ''),
      amount:      paymentData.amount.toFixed(2),
      currency:    'ILS',
      b2bFlag,
      lineItems:   (paymentData.metadata?.['line_items'] as never[]) ?? [{
        description: 'Payment',
        quantity:    1,
        unitPrice:   paymentData.amount.toFixed(2),
        totalPrice:  paymentData.amount.toFixed(2),
      }],
    });

    await supabase.from('invoices').update({
      yesh_docnum: invoiceResp.docnum,
      status:      'invoice_created',
      updated_at:  new Date().toISOString(),
    }).eq('id', invoiceId);

    // ITA allocation for B2B invoices — Yesh decides eligibility, OpalSwift stores result
    if (b2bFlag) {
      const allocResp = await invoicingProvider.createITAAllocation(invoiceResp.docnum);
      await supabase.from('invoices').update({
        allocation_number:     allocResp.allocationNumber,
        allocation_status:     allocResp.allocationNumber ? 'obtained' : allocResp.status,
        allocation_skip_reason: allocResp.skipReason ?? null,
        updated_at:            new Date().toISOString(),
      }).eq('id', invoiceId);

      // If SHAAM unavailable, queue for retry
      if (allocResp.skipReason === 'shaam_unavailable') {
        await supabase.from('invoice_retry_queue').insert({
          invoice_id:    invoiceId,
          tenant_id:     tenant.id,
          next_retry_at: new Date().toISOString(),
          last_error_code: 'SHAAM_UNAVAILABLE',
        });
      }
    }

    // Send SMS to client
    if (paymentData.metadata?.['client_phone']) {
      await invoicingProvider.sendInvoiceSMS(
        invoiceResp.docnum,
        String(paymentData.metadata['client_phone'])
      );
    }

    // Mark fully invoiced
    await supabase.from('invoices').update({
      status:     'fully_invoiced',
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId);

    // Mark webhook processed
    await supabase.from('webhook_events').update({
      outcome:      'processed',
      processed_at: new Date().toISOString(),
    }).eq('idempotency_key', idempotencyKey);

  } catch (err) {
    console.error('processWebhook error:', err);
    // Don't throw — let webhook_event stay in 'processing' for ops investigation
  }
}

async function handleRefundEvent(
  supabase: ReturnType<typeof createClient>,
  raw:      RapydWebhookPayload
): Promise<void> {
  const originalPaymentId = String(raw.data?.metadata?.['original_payment_id'] ?? '');
  if (!originalPaymentId) return;

  await supabase.from('invoices')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('rapyd_payment_id', originalPaymentId);
}
