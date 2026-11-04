import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { getEnv } from "../_shared/edge-runtime/env.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { parseTakbullIpn } from "../_shared/payments/takbull/ipn.ts";
import { mockTakbullApproving } from "../_shared/payments/takbull/mock.ts";
import { processTakbullIpn } from "../_shared/payments/takbull/process-ipn.ts";

/**
 * Takbull payment notice (IPN). Takbull calls the IPNAddress set on each order, with the order
 * in the query string. The notice is unsigned and proves nothing: processTakbullIpn checks the
 * order with Takbull (ValidateNotification + GetTransaction) and our amount before settling.
 *
 * Answers: 2xx when handled (settled, failed, still pending, duplicate, or an amount mismatch
 * that a retry can't fix); 400 when Takbull couldn't confirm it, so Takbull retries; 404 for an
 * order we don't know. No JWT (Takbull can't send one): see config.toml.
 */
Deno.serve(withMonitoring("takbull-ipn", async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ipn = parseTakbullIpn(req.url, req.method === "POST" ? await req.text() : "");
  if (!ipn.uniqId && !ipn.orderReference) return jsonResponse({ error: "Missing order" }, 400);

  const service = createServiceClient();
  // Dev / CI only: the in-memory Takbull can't confirm an order from an earlier request.
  const mock = getEnv("TAKBULL_MOCK") === "true";
  if (mock && req.headers.get("x-mock-signature") !== "mock-valid") {
    return jsonResponse({ error: "Invalid mock signature" }, 401);
  }

  const result = await processTakbullIpn(service, ipn, mock
    ? {
      apiFor: (row) =>
        Promise.resolve(mockTakbullApproving({
          uniqId: ipn.uniqId ?? row.provider_payment_ref,
          amountMinor: row.total_amount_minor,
          currency: row.currency,
        })),
    }
    : {});

  switch (result.status) {
    case "unknown_order":
      return jsonResponse({ received: false, ...result }, 404);
    case "unverified":
      return jsonResponse({ received: false, ...result }, 400);
    default:
      return jsonResponse({ received: true, ...result });
  }
}));
