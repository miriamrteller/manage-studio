/**
 * rapyd-webhook — inbound Rapyd webhook handler
 *
 * Spec: be-adapter-spec.md v1.4.0 §4 (Webhook Handler Spec)
 *
 * Processing order:
 * 1. Validate Rapyd HMAC signature                   (< 1s) — T-16
 * 2. Timestamp replay-attack check (> 60s → reject)  (< 1s) — T-17
 * 3. Tenant isolation check                           (< 1s) — T-19
 * 4. Idempotency check (webhook_events table)         (< 1s) — T-18
 * 5. Insert webhook_event row with outcome='processing'
 * 6. Return HTTP 200 immediately                             — spec §4(f)
 * 7. Process business logic (invoice → allocation → SMS)    — T-01, T-03
 * 8. Update webhook_event outcome='processed'
 *
 * Never block the Rapyd response on external API calls (step 6 before step 7).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { validateRapydWebhook } from "../../_shared/payments/providers/rapyd.ts";
import { YeshInvoiceAdapter } from "../../_shared/payments/providers/yesh.ts";
import { MockYeshAdapter } from "../../_shared/payments/providers/mock-yesh.ts";
import type { IInvoicingProvider } from "../../_shared/payments/providers/invoicing-types.ts";
import { WebhookError } from "../../_shared/payments/providers/invoicing-types.ts";

const WEBHOOK_URL_PATH = "/rapyd-webhook";
const MAX_BACKOFF_ATTEMPTS = 5;

// Exponential backoff intervals (minutes): 0, 5, 15, 60, 240
const BACKOFF_MINUTES = [0, 5, 15, 60, 240];

function nextRetryAt(attemptCount: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attemptCount, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
}

Deno.serve(async (req: Request) => {
  const operationId = crypto.randomUUID();

  // Service role Supabase client (bypasses RLS — required for webhook_events writes)
  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // ── 1. Read raw body (required for signature verification) ───────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json(
      { error: "Failed to read request body", operation_id: operationId },
      { status: 400 },
    );
  }

  // ── 2. Resolve tenant from access_key in headers (T-19 preparation) ──────
  const accessKey = req.headers.get("access_key");
  if (!accessKey) {
    return Response.json(
      { error: "Missing access_key header", operation_id: operationId },
      { status: 401 },
    );
  }

  const { data: tenantRows } = await service
    .from("tenants")
    .select("id, payment_provider_sandbox")
    .eq("payment_provider_public_key", accessKey)
    .eq("payment_provider", "rapyd")
    .limit(1);

  if (!tenantRows || tenantRows.length === 0) {
    // Don't reveal whether tenant exists — return 401 like a sig mismatch
    return Response.json(
      { error: "Invalid access_key", operation_id: operationId },
      { status: 401 },
    );
  }

  const tenantId = tenantRows[0].id as string;

  // ── 3. Load Rapyd credentials for HMAC verification ───────────────────────
  const { data: credRows } = await service.rpc("get_tenant_rapyd_credentials", {
    p_tenant_id: tenantId,
  });

  if (!credRows?.[0]?.secret_key) {
    return Response.json(
      { error: "Rapyd credentials not configured", operation_id: operationId },
      { status: 500 },
    );
  }

  const creds = credRows[0] as {
    access_key: string;
    secret_key: string;
    webhook_secret: string;
    sandbox: boolean;
  };

  // ── 4. Validate HMAC signature + timestamp replay check (T-16, T-17) ────
  let rapydPayload: {
    id: string;
    type: string;
    data: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      created_at: number;
      metadata: Record<string, unknown>;
    };
  };

  try {
    rapydPayload = await validateRapydWebhook({
      rawBody,
      headers: req.headers,
      urlPath: WEBHOOK_URL_PATH,
      accessKey: creds.access_key,
      secretKey: creds.webhook_secret || creds.secret_key,
    });
  } catch (err) {
    const webhookErr = err as WebhookError;
    // Log rejected event for security audit (no tenant data in error log)
    await service.from("webhook_events").insert({
      idempotency_key: `rejected_${crypto.randomUUID()}`,
      rapyd_event_type: "unknown",
      outcome:
        webhookErr.code === "WEBHOOK_REPLAY_ATTACK"
          ? "rejected_replay"
          : "rejected_signature",
      raw_payload: { error: webhookErr.message, headers_access_key: accessKey },
    });
    return Response.json(
      { error: webhookErr.message, operation_id: operationId },
      { status: 401 },
    );
  }

  // ── 5. Tenant isolation check (T-19) ──────────────────────────────────────
  const payloadTenantId = rapydPayload.data?.metadata?.["tenant_id"] as string | undefined;
  if (payloadTenantId && payloadTenantId !== tenantId) {
    await service.from("webhook_events").insert({
      idempotency_key: `cross_tenant_${crypto.randomUUID()}`,
      rapyd_event_type: rapydPayload.type,
      outcome: "rejected_cross_tenant",
      raw_payload: {
        payload_tenant_id: payloadTenantId,
        credential_tenant_id: tenantId,
        event_id: rapydPayload.id,
      },
    });
    return Response.json(
      { error: "CROSS_TENANT_ATTEMPT", operation_id: operationId },
      { status: 403 },
    );
  }

  // ── 6. Idempotency check (T-18) ───────────────────────────────────────────
  const idempotencyKey = `${rapydPayload.data.id}_${rapydPayload.type}`;

  const { data: existing } = await service
    .from("webhook_events")
    .select("id, outcome")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.outcome === "processed") {
      // Idempotent — second delivery, same event, already done
      return Response.json({ status: "duplicate", operation_id: operationId }, { status: 200 });
    }
    return Response.json(
      { error: "Event in conflicting processing state", operation_id: operationId },
      { status: 409 },
    );
  }

  // ── 7. Insert webhook_event row (outcome=processing) ─────────────────────
  const { data: eventRow, error: insertErr } = await service
    .from("webhook_events")
    .insert({
      idempotency_key: idempotencyKey,
      rapyd_event_type: rapydPayload.type,
      outcome: "processing",
      raw_payload: rapydPayload,
    })
    .select("id")
    .single();

  if (insertErr || !eventRow) {
    // Possible race: another handler inserted between our check and insert
    return Response.json({ status: "duplicate", operation_id: operationId }, { status: 200 });
  }

  const webhookEventId = eventRow.id as string;

  // ── 8. Return HTTP 200 immediately (before any external API calls) ────────
  //    Business logic runs asynchronously below using EdgeRuntime.waitUntil
  const immediateResponse = Response.json(
    { status: "received", operation_id: operationId },
    { status: 200 },
  );

  // Process business logic async (non-blocking)
  const processAsync = async () => {
    try {
      await processRapydEvent(service, tenantId, rapydPayload, webhookEventId);
      await service
        .from("webhook_events")
        .update({ outcome: "processed", processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    } catch (err) {
      console.error(`[rapyd-webhook] processing error for event ${webhookEventId}:`, err);
      await service
        .from("webhook_events")
        .update({ outcome: "dead_lettered" })
        .eq("id", webhookEventId);
    }
  };

  // Use EdgeRuntime.waitUntil to process after response is sent
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(processAsync());
  } else {
    // Fallback for local dev — synchronous
    await processAsync();
  }

  return immediateResponse;
});

// ---------------------------------------------------------------------------
// Business logic: orchestrate Rapyd event → Yesh invoice → allocation → SMS
// Canonical event flow per build-plan.md §4.3
// ---------------------------------------------------------------------------

async function processRapydEvent(
  service: ReturnType<typeof createClient>,
  tenantId: string,
  payload: {
    id: string;
    type: string;
    data: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      created_at: number;
      metadata: Record<string, unknown>;
    };
  },
  webhookEventId: string,
): Promise<void> {
  const rapydPaymentId = payload.data.id;
  const eventType = payload.type;

  if (eventType === "PAYMENT.FAILED") {
    // T-04: failed payment — mark any invoice row as payment_failed, no Yesh call
    await service
      .from("invoices")
      .update({ status: "payment_failed" })
      .eq("rapyd_payment_id", rapydPaymentId)
      .eq("tenant_id", tenantId);
    return;
  }

  if (
    eventType !== "PAYMENT.SUCCEEDED" &&
    eventType !== "PAYMENT.SUBSCRIPTION.PAID" &&
    eventType !== "PAYMENT.REFUND.COMPLETED"
  ) {
    // Unhandled event type — mark as processed (no-op)
    return;
  }

  if (eventType === "PAYMENT.REFUND.COMPLETED") {
    // T-21/T-22: refund — update invoice status; Yesh credit note created by separate call
    await service
      .from("invoices")
      .update({ status: "refunded" })
      .eq("rapyd_payment_id", rapydPaymentId)
      .eq("tenant_id", tenantId);
    return;
  }

  // ── PAYMENT.SUCCEEDED / PAYMENT.SUBSCRIPTION.PAID ─────────────────────────
  // Step 3 of canonical flow: mark payment_confirmed
  const metadata = payload.data.metadata;
  const clientName = String(metadata["client_name"] ?? "");
  const clientPhone = String(metadata["client_phone"] ?? "");
  const b2bFlag = metadata["b2b_flag"] === true;
  const amountDecimal = (payload.data.amount / 100).toFixed(2); // Rapyd amounts are in minor units

  // Create invoice record
  const { data: invoiceRow, error: invoiceErr } = await service
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      rapyd_payment_id: rapydPaymentId,
      status: "payment_confirmed",
      b2b_flag: b2bFlag,
      amount: amountDecimal,
      currency: payload.data.currency || "ILS",
      client_name: clientName,
      client_phone: clientPhone,
      line_items: metadata["line_items"] ?? [],
      // retention_expires_at set by trigger
    })
    .select("id")
    .single();

  if (invoiceErr || !invoiceRow) {
    throw new Error(`Failed to create invoice row: ${invoiceErr?.message}`);
  }

  const invoiceId = invoiceRow.id as string;

  // ── Step 4: Create Yesh invoice ────────────────────────────────────────────
  const yeshMock = Deno.env.get("YESH_MOCK") === "true";
  const invoicingProvider: IInvoicingProvider = yeshMock
    ? new MockYeshAdapter()
    : new YeshInvoiceAdapter(service);

  let docnum: string;
  try {
    const invoiceResp = await (
      invoicingProvider instanceof YeshInvoiceAdapter
        ? (invoicingProvider as YeshInvoiceAdapter).createInvoice({
            tenantId,
            clientName,
            clientPhone,
            amount: amountDecimal,
            currency: (payload.data.currency || "ILS") as "ILS" | "USD" | "EUR",
            lineItems: (metadata["line_items"] as {
              description: string;
              quantity: number;
              unitPrice: string;
              totalPrice: string;
            }[]) ?? [
              {
                description: String(metadata["description"] ?? "Payment"),
                quantity: 1,
                unitPrice: amountDecimal,
                totalPrice: amountDecimal,
              },
            ],
            b2bFlag,
          })
        : invoicingProvider.createInvoice({
            tenantId,
            clientName,
            clientPhone,
            amount: amountDecimal,
            currency: (payload.data.currency || "ILS") as "ILS" | "USD" | "EUR",
            lineItems: [],
            b2bFlag,
          })
    );

    docnum = invoiceResp.docnum;
    await service
      .from("invoices")
      .update({ yesh_docnum: docnum, status: "invoice_created" })
      .eq("id", invoiceId);
  } catch (err) {
    // T-20: Yesh unreachable — queue for retry, keep invoice row
    await enqueueRetry(service, invoiceId, tenantId, String(err));
    return;
  }

  // ── Step 5: ITA allocation (B2B only — Yesh decides eligibility) ──────────
  if (b2bFlag && invoicingProvider instanceof YeshInvoiceAdapter) {
    try {
      const allocResp = await invoicingProvider.createITAAllocationForTenant(docnum, tenantId);
      await service
        .from("invoices")
        .update({
          allocation_number: allocResp.allocationNumber,
          allocation_status: allocResp.allocationNumber ? "obtained" : "not_required",
          // T-11: store reason when allocation_number is null (HITL-PA-01)
          allocation_skip_reason: allocResp.allocationNumber
            ? null
            : "yesh_returned_null",
        })
        .eq("id", invoiceId);
    } catch (err) {
      // T-09: SHAAM/Yesh unavailable — queue retry, surface warning, no substitute
      await enqueueRetry(service, invoiceId, tenantId, String(err));
      await service
        .from("invoices")
        .update({ allocation_status: "error" })
        .eq("id", invoiceId);
      // Don't return — still send SMS for the invoice
    }
  } else if (!b2bFlag) {
    // T-02/T-08: B2C receipt — never request allocation
    await service
      .from("invoices")
      .update({
        allocation_status: "not_required",
        allocation_skip_reason: "b2c_invoice",
      })
      .eq("id", invoiceId);
  }

  // ── Step 6: Send invoice SMS ───────────────────────────────────────────────
  if (clientPhone && invoicingProvider instanceof YeshInvoiceAdapter) {
    try {
      await invoicingProvider.sendInvoiceSMSForTenant(docnum, clientPhone, tenantId);
    } catch {
      // SMS failure is non-blocking — invoice is already created
      console.warn(`[rapyd-webhook] SMS failed for docnum ${docnum}`);
    }
  }

  // ── Step 7: Mark fully_invoiced ───────────────────────────────────────────
  await service
    .from("invoices")
    .update({ status: "fully_invoiced" })
    .eq("id", invoiceId);
}

// ---------------------------------------------------------------------------
// Retry queue helper
// ---------------------------------------------------------------------------

async function enqueueRetry(
  service: ReturnType<typeof createClient>,
  invoiceId: string,
  tenantId: string,
  errorCode: string,
): Promise<void> {
  await service.from("invoice_retry_queue").insert({
    invoice_id: invoiceId,
    tenant_id: tenantId,
    attempt_count: 0,
    next_retry_at: nextRetryAt(0).toISOString(),
    last_error_code: errorCode.slice(0, 200),
  });
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
