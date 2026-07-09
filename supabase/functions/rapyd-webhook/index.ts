/**
 * rapyd-webhook — inbound Rapyd webhook handler
 *
 * Validation sequence (spec §4) — QA-verified order:
 *  1. Tenant lookup          (needed to resolve secret for sig verify)
 *  2. Signature verification (HMAC-SHA256, spec step 1)
 *  3. Replay-attack check    (> 60s → reject, spec step 2)
 *  4. Tenant isolation check (cross-tenant → HTTP 403)
 *  5. Idempotency check      (duplicate → HTTP 200 immediately)
 *  6. Insert webhook_events record (outcome = 'processing')
 *  7. Return HTTP 200 immediately (< 30s requirement)
 *  8. Async: createInvoice → createITAAllocation (if B2B) → sendSMS → mark fully_invoiced
 *
 * Error codes (§6.1): SIGNATURE_MISMATCH, WEBHOOK_REPLAY_ATTACK, DUPLICATE_WEBHOOK,
 *   CROSS_TENANT_ATTEMPT, PAYMENT_PROVIDER_UNAVAILABLE, SHAAM_UNAVAILABLE
 *
 * Adapter Mandate compliance: no concrete adapter imported here.
 *   Sig verification → standalone verifyRapydWebhookSignature utility.
 *   Business logic providers resolved via providerForInvoicing factory only.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyRapydWebhookSignature } from '../_shared/payments/rapyd-verify.ts';
import { providerForInvoicing, SupabaseVaultResolver } from '../_shared/payments/providers/index.ts';
import type { RapydWebhookPayload, TenantProviderConfig } from '../_shared/payments/providers/types.ts';

const WEBHOOK_URL_PATH      = '/functions/v1/rapyd-webhook';
const REPLAY_WINDOW_SECONDS = 60;

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const secretResolver = new SupabaseVaultResolver(supabase);
  const operationId    = crypto.randomUUID();

  // ── Read raw body (required before JSON.parse for sig verification) ────────
  const bodyString = await req.text();
  let raw: RapydWebhookPayload;

  try {
    raw = JSON.parse(bodyString) as RapydWebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'INVALID_JSON', request_id: operationId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Extract webhook headers ────────────────────────────────────────────────
  const salt      = req.headers.get('salt')       ?? '';
  const timestamp = req.headers.get('timestamp')  ?? '';
  const signature = req.headers.get('signature')  ?? '';
  const accessKey = req.headers.get('access_key') ?? '';

  // ── 1. Tenant lookup (must precede sig verify — secret is per-tenant) ──────
  const { data: tenantRows } = await supabase
    .from('tenant_configs')
    .select('id, payment_provider, invoicing_provider, rapyd_config, yesh_config')
    .filter('rapyd_config->>access_key', 'eq', accessKey)
    .eq('is_active', true)
    .limit(1);

  if (!tenantRows?.length) {
    return new Response(
      JSON.stringify({ error: 'TENANT_NOT_FOUND', request_id: operationId }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const tenant    = tenantRows[0] as TenantProviderConfig;
  const secretRef = (tenant.rapyd_config as { secret_key_ref: string }).secret_key_ref;
  const secretKey = await secretResolver.resolve(secretRef);

  // ── 2. Signature verification (spec §4, step 1) ────────────────────────────
  const signatureValid = await verifyRapydWebhookSignature(
    accessKey, secretKey, WEBHOOK_URL_PATH, salt, timestamp, bodyString, signature,
  );

  if (!signatureValid) {
    await supabase.from('webhook_events').insert({
      idempotency_key:  `${raw.data?.id ?? 'unknown'}_${raw.type}_failed_sig`,
      rapyd_event_type: raw.type,
      outcome:          'rejected_signature',
      raw_payload:      raw,
    });
    return new Response(
      JSON.stringify({ error: 'SIGNATURE_MISMATCH', request_id: operationId }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 3. Replay-attack check (spec §4, step 2) — after sig verify ───────────
  const tsSeconds  = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (isNaN(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > REPLAY_WINDOW_SECONDS) {
    return new Response(
      JSON.stringify({ error: 'WEBHOOK_REPLAY_ATTACK', request_id: operationId }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 4. Tenant isolation check ──────────────────────────────────────────────
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
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 5. Idempotency check ───────────────────────────────────────────────────
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
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'CONFLICTING_PROCESSING_STATE', request_id: operationId }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 6. Record webhook as processing ───────────────────────────────────────
  await supabase.from('webhook_events').insert({
    idempotency_key:  idempotencyKey,
    rapyd_event_type: raw.type,
    outcome:          'processing',
    raw_payload:      raw,
  });

  // ── 7. Return HTTP 200 immediately (spec §4f: < 30s) ──────────────────────
  const response = new Response(
    JSON.stringify({ status: 'received', operation_id: operationId }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  // ── 8. Async business logic ────────────────────────────────────────────────
  EdgeRuntime.waitUntil(processWebhook(supabase, secretResolver, tenant, raw, idempotencyKey));

  return response;
});

async function processWebhook(
  supabase:       ReturnType<typeof createClient>,
  secretResolver: SupabaseVaultResolver,
  tenant:         TenantProviderConfig,
  raw:            RapydWebhookPayload,
  idempotencyKey: string,
): Promise<void> {
  try {
    const eventType = raw.type;

    if (
      eventType !== 'PAYMENT.SUCCEEDED' &&
      eventType !== 'PAYMENT.SUBSCRIPTION.PAID'
    ) {
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
      await supabase.from('invoices')
        .update({ status: 'payment_confirmed', updated_at: new Date().toISOString() })
        .eq('id', invoiceId);
    } else {
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

    // ITA allocation for B2B — Yesh decides eligibility; OpalSwift stores result verbatim
    if (b2bFlag) {
      const allocResp = await invoicingProvider.createITAAllocation(invoiceResp.docnum);
      await supabase.from('invoices').update({
        allocation_number:      allocResp.allocationNumber,
        allocation_status:      allocResp.allocationNumber ? 'obtained' : allocResp.status,
        allocation_skip_reason: allocResp.skipReason ?? null,
        updated_at:             new Date().toISOString(),
      }).eq('id', invoiceId);

      if (allocResp.skipReason === 'shaam_unavailable') {
        await supabase.from('invoice_retry_queue').insert({
          invoice_id:      invoiceId,
          tenant_id:       tenant.id,
          next_retry_at:   new Date().toISOString(),
          last_error_code: 'SHAAM_UNAVAILABLE',
        });
      }
    }

    // Send SMS to client
    if (paymentData.metadata?.['client_phone']) {
      await invoicingProvider.sendInvoiceSMS(
        invoiceResp.docnum,
        String(paymentData.metadata['client_phone']),
      );
    }

    await supabase.from('invoices').update({
      status:     'fully_invoiced',
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId);

    await supabase.from('webhook_events').update({
      outcome:      'processed',
      processed_at: new Date().toISOString(),
    }).eq('idempotency_key', idempotencyKey);

  } catch (err) {
    console.error('processWebhook error:', err);
    // Do not throw — leave webhook_event in 'processing' for ops investigation
  }
}

async function handleRefundEvent(
  supabase: ReturnType<typeof createClient>,
  raw:      RapydWebhookPayload,
): Promise<void> {
  const originalPaymentId = String(raw.data?.metadata?.['original_payment_id'] ?? '');
  if (!originalPaymentId) return;

  await supabase.from('invoices')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('rapyd_payment_id', originalPaymentId);
}
