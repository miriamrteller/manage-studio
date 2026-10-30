/**
 * job-contract-pdf-link
 *
 * "Download signed contract" for the admin shoot page and the client portal.
 * The PDF sits in the private legal-documents bucket; this returns a 10-minute
 * signed URL after a server-side check (_shared/contract-pdf/access.ts): a
 * tenant admin of the job's tenant, or the client themselves (the person on
 * the job or a member of its account). Anyone else gets 404.
 *
 * Authorization: Bearer <supabase session>
 * Body: { engagementId }
 * Response: { url, expiresAt, signedAt, filename }
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { loadJobContractContext } from "../_shared/job-contract.ts";
import { decideContractPdfAccess } from "../_shared/contract-pdf/access.ts";
import { CONTRACT_PDF_BUCKET, contractPdfFilename, hasStoredPdf } from "../_shared/contract-pdf/evidence.ts";

const LINK_TTL_SECONDS = 10 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as { engagementId?: unknown } | null;
    const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    if (!engagementId) return jsonResponse({ error: "engagementId is required" }, 400);

    const { data: profile } = await service
      .from("user_profiles")
      .select("id, tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const tenantId = (profile?.tenant_id as string | null) ?? null;
    if (!tenantId) return jsonResponse({ error: "User has no tenant" }, 403);

    const [{ data: tenantRow }, { data: personRow }, { data: memberships }] = await Promise.all([
      service.from("tenants").select("language_default").eq("id", tenantId).maybeSingle(),
      service.from("people").select("id").eq("tenant_id", tenantId).eq("user_profile_id", user.id).maybeSingle(),
      service.from("account_members").select("account_id").eq("tenant_id", tenantId).eq("user_profile_id", user.id),
    ]);

    const job = await loadJobContractContext(service, {
      tenantId,
      engagementId,
      language: tenantRow?.language_default === "he" ? "he" : "en",
    });

    let evidence: { id: string; pdf_storage_path: string | null; pdf_sha256: string | null; signed_at: string } | null = null;
    if (job?.waiverEvidenceId) {
      const { data } = await service
        .from("waiver_evidence")
        .select("id, pdf_storage_path, pdf_sha256, signed_at")
        .eq("id", job.waiverEvidenceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      evidence = (data as typeof evidence) ?? null;
    }

    const decision = decideContractPdfAccess({
      callerTenantId: tenantId,
      callerRoles: (profile?.role as string[] | null) ?? [],
      callerPersonId: (personRow?.id as string | undefined) ?? null,
      callerAccountIds: (memberships ?? []).map((m) => m.account_id as string),
      job: job ? { tenantId, personId: job.personId, accountId: job.accountId } : null,
      evidence,
      hasStoredPdf,
    });
    if (!decision.ok) return jsonResponse({ error: decision.error }, decision.status);

    const filename = contractPdfFilename(evidence!.id);
    const { data: signed, error: signError } = await service.storage
      .from(CONTRACT_PDF_BUCKET)
      .createSignedUrl(evidence!.pdf_storage_path as string, LINK_TTL_SECONDS, { download: filename });
    if (signError || !signed?.signedUrl) {
      console.error("[job-contract-pdf-link] signed URL failed:", signError?.message);
      return jsonResponse({ error: "Could not prepare the download" }, 500);
    }

    // Every issued link is on the audit trail (who fetched which evidence row).
    await service.from("audit_log").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "job_contract_pdf_link_issued",
      entity_type: "waiver_evidence",
      entity_id: evidence!.id,
      after_state: { engagement_id: engagementId, role: decision.role, expires_in_seconds: LINK_TTL_SECONDS },
    });

    return jsonResponse({
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
      signedAt: evidence!.signed_at,
      filename,
    });
  } catch (err) {
    console.error("[job-contract-pdf-link]", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
