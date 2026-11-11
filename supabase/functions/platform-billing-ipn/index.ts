import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { parseTakbullIpn } from "../_shared/payments/takbull/ipn.ts";
import { processPlatformBillingIpn } from "../_shared/payments/takbull/platform-billing.ts";

/**
 * Takbull payment notice for OpalSwift's own orders (a studio paying for its plan). Unsigned,
 * like takbull-ipn: processPlatformBillingIpn checks the order with Takbull using OpalSwift's
 * keys, and our amount, before anything is recorded or a card is saved.
 *
 * Answers: 2xx when handled; 400 when Takbull couldn't confirm it (Takbull retries); 404 for an
 * order we don't know. No JWT (Takbull can't send one): see config.toml.
 */
Deno.serve(withMonitoring("platform-billing-ipn", async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ipn = parseTakbullIpn(req.url, req.method === "POST" ? await req.text() : "");
  if (!ipn.uniqId && !ipn.orderReference) return jsonResponse({ error: "Missing order" }, 400);

  const result = await processPlatformBillingIpn(createServiceClient(), ipn);
  switch (result.status) {
    case "unknown_order":
      return jsonResponse({ received: false, ...result }, 404);
    case "unverified":
      return jsonResponse({ received: false, ...result }, 400);
    default:
      return jsonResponse({ received: true, ...result });
  }
}));
