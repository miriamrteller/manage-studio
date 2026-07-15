/**
 * tranzila-payment-callback — Supabase Edge Function
 *
 * Inbound NOTIFY handler for Tranzila pay-by-link payment results.
 *
 * POST /functions/v1/tranzila-payment-callback
 *
 * Security: Secret URL token (approved Q7 mechanism — see be-adapter-spec §7).
 * No HMAC provided by Tranzila on NOTIFY.
 * TODO (Day-1 D1): Add Tranzila IP allowlist as defense-in-depth.
 *   Tranzila NOTIFY servers have known IP ranges — configure at Edge Function level.
 *
 * Flow (spec §7 edge function 2):
 *   1. Parse payload — accept both application/x-www-form-urlencoded AND application/json
 *   2. Extract pr_id
 *   3. Idempotency check: payment_callbacks_log
 *   4. Insert raw payload to log
 *   5. Lookup booking by pr_id
 *   6. If String(processor_response_code) === '000':
 *      - Update booking.state = CONFIRMED
 *      - Trigger createInvoice (fire-and-forget, async)
 *      - Notify client via email
 *   7. Else: log failure, leave state = RESERVED
 *   8. ALWAYS respond 200 OK (T-19)
 *
 * Does NOT compute VAT or ITA thresholds (Tax Delegation Doctrine).
 */

import { serve }         from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { providerForInvoicing, SupabaseVaultResolver } from "../_shared/payments/providers/index.ts";
import type { TenantProviderConfig }                   from "../_shared/payments/providers/types.ts";

// Always respond 200 so Tranzila stops retrying (spec §7, T-19)
const OK_200 = new Response("ok", { status: 200 });

serve(async (req: Request): Promise<Response> => {
  try {
    // ── Secret URL token check (Q7 resolution) ──────────────────────────────
    const url       = new URL(req.url);
    const urlToken  = url.searchParams.get("token");
    const envToken  = Deno.env.get("TRANZILA_CALLBACK_SECRET");
    if (envToken && urlToken !== envToken) {
      // Log but still 200 — don't signal rejection to caller
      console.warn("[tranzila-callback] invalid secret token");
      return OK_200;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Parse payload — form-encoded OR JSON (Q5 resolution) ────────────
    let rawPayload: Record<string, unknown>;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text  = await req.text();
      rawPayload  = Object.fromEntries(new URLSearchParams(text));
    } else {
      rawPayload  = await req.json();
    }

    // ── 2. Extract pr_id ────────────────────────────────────────────────────
    const prId = String(rawPayload.pr_id ?? "");
    if (!prId) {
      console.warn("[tranzila-callback] missing pr_id");
      return OK_200;
    }

    // ── 3. Idempotency check ────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("payment_callbacks_log")
      .select("id, processed")
      .eq("pr_id", prId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing?.processed) {
      console.log(`[tranzila-callback] duplicate callback for pr_id=${prId} — skipping`);
      return OK_200;
    }

    // ── 4. Insert to log ────────────────────────────────────────────────────
    await supabase
      .from("payment_callbacks_log")
      .insert({ pr_id: prId, raw_payload: rawPayload, processed: false });

    // ── 5. Lookup booking — include b2b_flag (R-02) ─────────────────────────
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, tenant_id, client_name, client_email, service_name, amount, state, b2b_flag")
      .eq("pr_id", prId)
      .single();

    if (!booking) {
      // Unknown pr_id — log and return 200 (T-17)
      console.warn(`[tranzila-callback] unknown pr_id=${prId}`);
      await supabase
        .from("payment_callbacks_log")
        .update({ processed: false, error_message: "pr_id not found in bookings" })
        .eq("pr_id", prId);
      return OK_200;
    }

    // ── 6. Process result ───────────────────────────────────────────────────
    const success = String(rawPayload.processor_response_code) === "000";

    if (success && booking.state === "RESERVED") {
      // Update booking to CONFIRMED
      await supabase
        .from("bookings")
        .update({ state: "CONFIRMED" })
        .eq("id", booking.id);

      // Fire-and-forget: createInvoice + email notification
      _triggerPostPaymentAsync(supabase, booking).catch(err =>
        console.error("[tranzila-callback] post-payment async error", err),
      );
    } else if (!success) {
      console.log(
        `[tranzila-callback] payment failed for pr_id=${prId} ` +
        `response_code=${rawPayload.processor_response_code}`,
      );
      // Leave state = RESERVED (T-18)
    }

    // Mark log entry processed
    await supabase
      .from("payment_callbacks_log")
      .update({ processed: true })
      .eq("pr_id", prId)
      .eq("processed", false);

    // ── 8. ALWAYS 200 ───────────────────────────────────────────────────────
    return OK_200;
  } catch (err) {
    console.error("[tranzila-callback] unhandled error", err);
    // Still 200 — spec requires it
    return OK_200;
  }
});

/**
 * Async: issue invoice + send client notification email.
 * Fire-and-forget from webhook handler — failures are logged but do not affect
 * the 200 response already returned to Tranzila.
 */
async function _triggerPostPaymentAsync(
  supabase: ReturnType<typeof createClient>,
  booking: {
    id:           string;
    tenant_id:    string;
    client_name:  string;
    client_email: string;
    service_name: string;
    amount:       number | string;
    /** R-02: read from bookings row — never hardcoded. */
    b2b_flag:     boolean;
  },
): Promise<void> {
  // Load tenant invoicing setting
  const { data: creds } = await supabase
    .from("tenant_credentials")
    .select("invoicing_enabled, invoice_lang, default_doc_type")
    .eq("tenant_id", booking.tenant_id)
    .single();

  // Load tranzila terminal
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("tranzila_terminal_name")
    .eq("tenant_id", booking.tenant_id)
    .single();

  if (!creds?.invoicing_enabled || !settings?.tranzila_terminal_name) {
    console.log(`[tranzila-callback] invoicing disabled for tenant ${booking.tenant_id}`);
    return;
  }

  const tenantConfig: TenantProviderConfig = {
    id:                 booking.tenant_id,
    payment_provider:   "tranzila" as const,
    invoicing_provider: "tranzila" as const,
    tranzila_config:    { terminal_name: settings.tranzila_terminal_name },
    supabaseClient:     supabase,
  };

  const secretResolver = new SupabaseVaultResolver(supabase);
  const invoicer       = await providerForInvoicing(tenantConfig, secretResolver);

  await invoicer.createInvoice({
    tenantId:    booking.tenant_id,
    clientName:  booking.client_name,
    clientPhone: "",
    clientEmail: booking.client_email,
    amount:      String(booking.amount),
    currency:    "ILS",
    // R-02: pass b2b_flag from the bookings row — never hardcode false.
    b2bFlag:     booking.b2b_flag,
    lineItems: [{
      description: booking.service_name,
      quantity:    1,
      unitPrice:   String(booking.amount),
      totalPrice:  String(booking.amount),
    }],
  });

  // TODO: send client notification email via send-notification edge function
  console.log(`[tranzila-callback] invoice issued for booking ${booking.id}`);
}
