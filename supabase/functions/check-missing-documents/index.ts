/**
 * Cron: alert admins when succeeded payments lack tax docs, and retry
 * admin invoice emails until payment_document_admin_email_sent is audited.
 */
import { jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { runCheckMissingDocuments } from "../_shared/payments/check-missing-documents.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function authorizeCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!authorizeCron(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

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
});
