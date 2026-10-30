/**
 * job-contract-pdf-generate
 *
 * Admin "Generate PDF" for a shoot whose contract was signed but whose PDF
 * failed at signing (the evidence row carries the sentinels and
 * job_details.contract_pdf_pending is set). Renders from the sealed
 * wording_snapshot, stores the result in waiver_evidence_pdfs (never on the
 * immutable evidence row), clears the flag, audit-logs it and returns a
 * 10-minute signed URL. See _shared/contract-pdf/regenerate.ts.
 *
 * Authorization: Bearer <supabase session> (tenant admin)
 * Body: { engagementId }
 * Response: { url, expiresAt, generatedAt, created }
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { loadJobContractContext } from "../_shared/job-contract.ts";
import { decideContractPdfGenerateAccess } from "../_shared/contract-pdf/access.ts";
import { CONTRACT_PDF_BUCKET, contractPdfFilename } from "../_shared/contract-pdf/evidence.ts";
import { regenerateContractPdf } from "../_shared/contract-pdf/regenerate.ts";

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

    const { data: tenant } = await service
      .from("tenants")
      .select("name, logo_url, language_default")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);
    const language = tenant.language_default === "he" ? "he" : "en";

    const job = await loadJobContractContext(service, { tenantId, engagementId, language });
    const access = decideContractPdfGenerateAccess({
      callerTenantId: tenantId,
      callerRoles: (profile?.role as string[] | null) ?? [],
      job: job ? { tenantId } : null,
    });
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);

    const result = await regenerateContractPdf(service, {
      tenantId,
      tenant: { name: tenant.name as string, logo_url: (tenant.logo_url as string | null) ?? null },
      language,
      job: job!,
      actorId: user.id,
    });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);

    const { data: signed, error: signError } = await service.storage
      .from(CONTRACT_PDF_BUCKET)
      .createSignedUrl(result.pdf.pdf_storage_path, LINK_TTL_SECONDS, { download: contractPdfFilename(job!.waiverEvidenceId!) });
    if (signError || !signed?.signedUrl) {
      console.error("[job-contract-pdf-generate] signed URL failed:", signError?.message);
      return jsonResponse({ error: "PDF generated, but the download link could not be prepared" }, 500);
    }

    return jsonResponse({
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
      generatedAt: result.pdf.generated_at,
      created: result.created,
    });
  } catch (err) {
    console.error("[job-contract-pdf-generate]", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
