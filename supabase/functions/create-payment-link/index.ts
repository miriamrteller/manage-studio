/**
 * create-payment-link — Supabase Edge Function
 *
 * Creates a Tranzila pay-by-link for a booking.
 *
 * POST /functions/v1/create-payment-link
 * Body: { bookingId: string, tenantId: string }
 *
 * Flow (spec §7 edge function 1):
 *   1. Validate input
 *   2. Lookup tranzila_terminal_name from tenant_settings
 *   3. Build auth headers
 *   4. POST to Tranzila /v1/pr/create
 *   5. Update bookings: pr_id, pr_link, pr_expires_at, state = RESERVED
 *   6. Return { pr_link }
 *
 * Does NOT compute VAT or ITA thresholds (Tax Delegation Doctrine).
 * Does NOT store raw card data (PCI SAQ A).
 */

import { serve }                            from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }                     from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { providerForPayment, SupabaseVaultResolver } from "../_shared/payments/providers/index.ts";
import type { TenantProviderConfig }        from "../_shared/payments/providers/types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { bookingId, tenantId } = body as { bookingId?: string; tenantId?: string };

    if (!bookingId || !tenantId) {
      return jsonError(400, "bookingId and tenantId are required");
    }

    // 1. Load booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, amount, client_name, client_email, service_name, booking_language, payment_methods")
      .eq("id", bookingId)
      .eq("tenant_id", tenantId)
      .single();

    if (bookingErr || !booking) {
      return jsonError(404, `Booking not found: ${bookingId}`);
    }

    // 2. Load tenant settings
    const { data: settings, error: settingsErr } = await supabase
      .from("tenant_settings")
      .select("tranzila_terminal_name, payment_expiry_minutes")
      .eq("tenant_id", tenantId)
      .single();

    if (settingsErr || !settings?.tranzila_terminal_name) {
      return jsonError(400, "Tenant Tranzila terminal not configured");
    }

    // 3. Load tenant invoicing enabled flag
    const { data: creds } = await supabase
      .from("tenant_credentials")
      .select("invoicing_enabled")
      .eq("tenant_id", tenantId)
      .single();

    const tenantConfig: TenantProviderConfig = {
      id:                 tenantId,
      payment_provider:   "tranzila" as const,
      invoicing_provider: "tranzila" as const,
      tranzila_config:    { terminal_name: settings.tranzila_terminal_name },
      supabaseClient:     supabase,
    };

    const secretResolver = new SupabaseVaultResolver(supabase);
    const provider       = await providerForPayment(tenantConfig, secretResolver);

    // 4. Create pay-by-link
    const checkout = await provider.createCheckout(Number(booking.amount), {
      tenantId,
      clientName:     booking.client_name,
      clientEmail:    booking.client_email,
      description:    booking.service_name,
      currency:       "ILS",
      successUrl:     "",
      errorUrl:       "",
      webhookUrl:     "",
      // Tranzila-specific extras passed via meta cast
      ...(booking as any),
      bookingId,
      language:       booking.booking_language ?? "hebrew",
      paymentMethods: booking.payment_methods ?? [1],
    } as any);

    // 5. Update booking
    const expiryMinutes = settings.payment_expiry_minutes ?? 20;
    await supabase
      .from("bookings")
      .update({
        pr_id:        checkout.checkoutId,
        pr_link:      checkout.redirectUrl,
        pr_expires_at: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
        state:        "RESERVED",
      })
      .eq("id", bookingId);

    return jsonOk({ pr_link: checkout.redirectUrl, pr_id: checkout.checkoutId });
  } catch (err) {
    console.error("[create-payment-link]", err);
    return jsonError(500, "Internal error");
  }
});

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
