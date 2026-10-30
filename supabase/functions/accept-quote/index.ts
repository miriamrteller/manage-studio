/**
 * accept-quote — PUBLIC endpoint behind /quote/:token "Accept".
 *
 * The quote's 256-bit public token is the credential (no JWT). All state
 * changes happen in ONE database transaction inside accept_quote()
 * (20261030000300_quotes.sql): lead → job (Thread A), job_status 'booked', deposit +
 * balance payment requests. That RPC is service-role only, which is why this
 * function exists; it also sends the booking confirmation afterwards.
 *
 * Idempotent: a repeat call (double-click, retry) replays the stored result.
 * The confirmation email is claimed through automatic_email_log, so it goes
 * out once — and a failed first send is retried by the next click.
 */
import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";
import {
  AUTOMATIC_EMAIL_TENANT_COLUMNS,
  type AutomaticEmailTenant,
  sendAutomaticEmail,
} from "../_shared/photographer-emails/send.ts";
import { type AcceptQuoteResult, bookingConfirmedVariables } from "../_shared/photographer-emails/variables.ts";

const payloadSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  tenantId: z.string().uuid(),
  selectedLineIds: z.array(z.string().uuid()).max(100).default([]),
});

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch {
    return jsonResponse({ ok: false, code: "invalid_request" }, 400);
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("accept_quote", {
    p_token: payload.token,
    p_tenant_id: payload.tenantId,
    p_selected_line_ids: payload.selectedLineIds,
  });
  if (error) {
    console.error("[accept-quote] accept_quote failed:", error.message);
    return jsonResponse({ ok: false, code: "server_error" }, 500);
  }

  const result = data as AcceptQuoteResult;
  if (!result.ok) {
    return jsonResponse({ ok: false, code: result.code ?? "not_open" }, 409);
  }

  try {
    await sendBookingConfirmation(service, payload, result);
  } catch (emailError) {
    // The booking stands; the next click (or support) can resend.
    console.error("[accept-quote] booking confirmation failed:", emailError);
  }

  // send_contract: the admin sends it from the accepted quote (send-job-contract-link
  // needs an admin session); the client page says the contract will follow.
  return jsonResponse({
    ok: true,
    already_accepted: Boolean(result.already_accepted),
    total_minor: result.total_minor,
    deposit_minor: result.deposit_minor,
    balance_minor: result.balance_minor,
    currency: result.currency,
    shoot_date: result.shoot_date,
    balance_due_date: result.balance_due_date,
    contract_to_follow: Boolean(result.send_contract),
  });
});

async function sendBookingConfirmation(
  service: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof payloadSchema>,
  result: AcceptQuoteResult,
): Promise<void> {
  if (!result.quote_id) return;
  const [{ data: tenant, error: tenantError }, { data: contact, error: contactError }] = await Promise.all([
    service.from("tenants").select(AUTOMATIC_EMAIL_TENANT_COLUMNS).eq("id", payload.tenantId).single(),
    service.rpc("quote_client_contact", { p_quote_id: result.quote_id }).maybeSingle(),
  ]);
  if (tenantError || !tenant) throw new Error(`tenant lookup: ${tenantError?.message ?? "not found"}`);
  if (contactError) throw new Error(`contact lookup: ${contactError.message}`);

  const recipient = contact as { client_name: string | null; client_email: string | null } | null;
  if (!recipient?.client_email) return;

  const t = tenant as unknown as AutomaticEmailTenant;
  const outcome = await sendAutomaticEmail(service, {
    tenant: t,
    key: "booking_confirmed",
    quoteId: result.quote_id,
    to: recipient.client_email,
    variables: bookingConfirmedVariables(result, {
      recipientName: recipient.client_name,
      quoteUrl: `${tenantBaseUrl(t.subdomain)}/quote/${payload.token}`,
      language: t.language_default === "he" ? "he" : "en",
    }),
  });
  console.log(`[accept-quote] booking_confirmed ${outcome} for quote ${result.quote_id}`);
}
