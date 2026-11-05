/**
 * Cron: alert admins when succeeded payments lack tax docs, and retry
 * admin invoice emails until payment_document_admin_email_sent is audited.
 */
import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { runCheckMissingDocuments } from "../_shared/payments/check-missing-documents.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

Deno.serve(withMonitoring("check-missing-documents", async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  try {
    const service = createServiceClient();
    const result = await runCheckMissingDocuments(service);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    console.error("[check-missing-documents]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "check-missing-documents failed" },
      500,
    );
  }
}));
