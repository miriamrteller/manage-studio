import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  currentHmacVersion,
  getHmacKey,
  hmacSha256Base64url,
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqual,
} from "../_shared/hmac.ts";
import {
  extractWaiverToken,
  verifyWaiverToken,
} from "../_shared/waiver-token.ts";

// V1: PDF generation is deferred — the waiver_evidence row IS the tamper-evident
// legal record (wording_snapshot + record_hmac over 14 canonical fields).
// A PDF export can be generated on-demand from the admin panel in V2 once we
// have a Unicode-capable font pipeline. For now we store a sentinel path so the
// DB constraint (NOT NULL on pdf_storage_path) is satisfied without any upload.
const PDF_DEFERRED_SENTINEL = "v1-deferred";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const service = createServiceClient();

    // Two auth paths: Supabase session (authenticated users) or WaiverToken (guests)
    let tenantId: string;
    let signedByEmail: string | null;
    let actorId: string | null = null;
    let signedByRole: string;
    let waiverTokenEngagementId: string | null = null;

    const rawWaiverToken = extractWaiverToken(authHeader);
    if (rawWaiverToken) {
      // Guest path — validate the waiver link token
      const wtp = await verifyWaiverToken(rawWaiverToken);
      if (!wtp) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);
      tenantId = wtp.tid;
      signedByEmail = wtp.em;
      signedByRole = "self";
      waiverTokenEngagementId = wtp.eid;
    } else {
      // Authenticated path — validate Supabase session
      const jwt = authHeader.replace("Bearer ", "");
      if (!jwt) return jsonResponse({ error: "Missing authorization" }, 401);

      const { data: { user }, error: authError } = await service.auth.getUser(jwt);
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: profile } = await service
        .from("user_profiles")
        .select("tenant_id, email")
        .eq("id", user.id)
        .single();
      if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
      tenantId = profile.tenant_id as string;
      signedByEmail = (profile.email as string) ?? null;
      actorId = user.id;

      // Role resolved below after body is parsed (need person_id from body)
      signedByRole = "__pending__";
    }

    const body = await req.json().catch(() => null);
    if (
      !body?.person_id ||
      !body?.consent_template_id ||
      !body?.consent_version ||
      !body?.typed_name ||
      !body?.idempotency_key ||
      !body?.view_token ||
      body?.viewed_at_ts == null
    ) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // offering_id links this evidence to a specific class — optional for backward compat
    const offeringId: string | null = body.offering_id ?? null;

    // --- Validate view_token (15-minute window) ---
    const nowTs = Math.floor(Date.now() / 1000);
    if (nowTs - body.viewed_at_ts > 900) {
      return jsonResponse({ error: "view_token expired" }, 401);
    }
    const hmacVersion = currentHmacVersion();
    const hmacKey = getHmacKey(hmacVersion);
    const expected = await hmacSha256Base64url(
      hmacKey,
      `${body.person_id}:${body.consent_template_id}:${body.viewed_at_ts}`,
    );
    if (!timingSafeEqual(body.view_token, expected)) {
      return jsonResponse({ error: "view_token invalid" }, 401);
    }

    // --- Load and verify active template ---
    const { data: template } = await service
      .from("consent_templates")
      .select("id, version, content, name")
      .eq("tenant_id", tenantId)
      .eq("id", body.consent_template_id)
      .eq("status", "active")
      .single();
    if (!template) return jsonResponse({ error: "No active consent template" }, 404);
    if (template.version !== body.consent_version) {
      return jsonResponse(
        { error: "Template version mismatch — please reload and re-sign" },
        409,
      );
    }

    // --- Guest path: verify body.person_id belongs to the token's engagement ---
    if (waiverTokenEngagementId) {
      const { data: tokenEng } = await service
        .from("engagements")
        .select("person_id")
        .eq("id", waiverTokenEngagementId)
        .eq("tenant_id", tenantId)
        .single();
      if (!tokenEng || tokenEng.person_id !== body.person_id) {
        return jsonResponse({ error: "person_id does not match waiver token" }, 401);
      }
    }

    // --- Resolve signer role for authenticated users (pending from auth block) ---
    if (signedByRole === "__pending__") {
      const { data: signerProfile } = await service
        .from("user_profiles")
        .select("person_id")
        .eq("id", actorId!)
        .single();
      signedByRole = signerProfile?.person_id === body.person_id ? "self" : "guardian";
    }

    // --- Capture server-side metadata ---
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;
    const acceptLang = req.headers.get("accept-language") ?? null;
    const signedAt = new Date().toISOString();

    // --- Load tenant name for PDF header ---
    const { data: tenant } = await service
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();
    const tenantName = tenant?.name ?? "Studio";

    // --- Compute hashes ---
    const consent_version_hash = await sha256Hex(template.content as string);

    // V1: no PDF upload — use sentinel path + zeroed hash
    const evidenceId = crypto.randomUUID();
    const storagePath = PDF_DEFERRED_SENTINEL;
    const pdf_sha256 = "0".repeat(64);

    // --- Compute record_hmac over canonical alphabetically-sorted 14-field JSON ---
    const canonical = JSON.stringify(
      Object.fromEntries(
        Object.entries({
          accept_language: acceptLang,
          consent_template_id: body.consent_template_id,
          consent_version: template.version,
          consent_version_hash,
          idempotency_key: body.idempotency_key,
          ip_address: ip,
          pdf_sha256,
          person_id: body.person_id,
          signed_at: signedAt,
          signed_by_email: signedByEmail,
          signed_by_name: body.typed_name,
          signed_by_role: signedByRole,
          tenant_id: tenantId,
          user_agent: userAgent,
        }).sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    const record_hmac = await hmacSha256Hex(hmacKey, canonical);

    // --- Atomic DB write via sign_waiver() SECURITY DEFINER RPC ---
    const { data: returnedId, error: rpcError } = await service.rpc("sign_waiver", {
      p_id: evidenceId,
      p_tenant_id: tenantId,
      p_person_id: body.person_id,
      p_account_member_id: body.account_member_id ?? null,
      p_consent_template_id: body.consent_template_id,
      p_consent_version: template.version,
      p_consent_version_hash: consent_version_hash,
      p_wording_snapshot: template.content,
      p_pdf_storage_path: storagePath,
      p_pdf_sha256: pdf_sha256,
      p_record_hmac: record_hmac,
      p_hmac_key_version: hmacVersion,
      p_viewed_at: new Date(body.viewed_at_ts * 1000).toISOString(),
      p_signed_by_name: body.typed_name,
      p_signed_by_email: signedByEmail,
      p_signed_by_role: signedByRole,
      p_signature_method: "typed_name_checkbox",
      p_signed_at: signedAt,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_accept_language: acceptLang,
      p_idempotency_key: body.idempotency_key,
      p_otp_verify_sid: body.otp_verify_sid ?? null,
      p_actor_id: actorId,
      p_offering_id: offeringId,
    });

    if (rpcError) {
      // PDF was uploaded but RPC failed — log for manual cleanup; idempotency_key helps locate orphaned file
      console.error(
        "[accept-waiver] sign_waiver RPC failed after PDF upload:",
        rpcError,
        storagePath,
      );
      throw new Error(
        "Failed to record waiver — please contact support with reference: " +
          body.idempotency_key,
      );
    }

    // Activate all pending_waiver engagements for this person in this tenant.
    // One signed waiver covers all concurrent enrollments under the same template version.
    const { error: activateError } = await service
      .from("engagements")
      .update({ status: "active" })
      .eq("person_id", body.person_id)
      .eq("tenant_id", tenantId)
      .eq("status", "pending_waiver");

    if (activateError) {
      // Non-fatal: waiver IS recorded, but engagement status didn't update.
      // Log for ops team to fix manually. Do not fail the request.
      console.error(
        "[accept-waiver] failed to activate pending_waiver engagements:",
        activateError,
        { personId: body.person_id, tenantId },
      );
    }

    return jsonResponse({ evidence_id: returnedId, signed_at: signedAt });
  } catch (err) {
    console.error("[accept-waiver]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
