import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { canSignJobContract, loadJobContractContext, renderJobContract } from "../_shared/job-contract.ts";
import {
  currentHmacVersion,
  getHmacKey,
  hmacSha256Base64url,
  sha256Hex,
  timingSafeEqual,
} from "../_shared/edge-runtime/hmac.ts";
import {
  extractWaiverToken,
  verifyWaiverToken,
} from "../_shared/waiver-token.ts";
import { NO_PDF, prepareWaiverPdf, waiverRecordHmac, type WaiverPdfArtifact } from "../_shared/contract-pdf/evidence.ts";
import {
  type ContractEmailTenant,
  type ExistingWaiverEvidence,
  findExistingWaiverEvidence,
  notifyJobContractSigned,
} from "../_shared/contract-pdf/job-contract-signing.ts";
import { AUTOMATIC_EMAIL_TENANT_COLUMNS } from "../_shared/photographer-emails/send.ts";

// PDF policy (see _shared/contract-pdf/evidence.ts):
// - Dance waivers: V1 behaviour — the waiver_evidence row IS the tamper-evident
//   legal record (wording_snapshot + record_hmac over 15 canonical fields); a
//   sentinel path and zeroed pdf_sha256 are stored, nothing is uploaded.
// - Job (photographer) contracts: the signed PDF is rendered and uploaded to
//   the legal-documents bucket BEFORE the evidence insert, so the real
//   pdf_sha256 is one of the sealed fields; a copy is emailed to both parties.

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
      const wtp = await verifyWaiverToken(service, rawWaiverToken);
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

    // --- Job contract? Render merge fields exactly as get-waiver-engagement did ---
    // (engagement with a job_details row). wording_snapshot/hash then cover the
    // rendered text the client actually saw, not the raw template.
    const contractEngagementId: string | null =
      waiverTokenEngagementId ?? (typeof body.engagement_id === "string" ? body.engagement_id : null);
    let jobContract: Awaited<ReturnType<typeof loadJobContractContext>> = null;
    type ContractTenantRow = ContractEmailTenant & { logo_url: string | null };
    let contractTenant: ContractTenantRow | null = null;
    if (contractEngagementId) {
      const { data: tenantRow } = await service
        .from("tenants")
        .select(`${AUTOMATIC_EMAIL_TENANT_COLUMNS}, logo_url`)
        .eq("id", tenantId)
        .maybeSingle();
      contractTenant = (tenantRow as ContractTenantRow | null) ?? null;
      jobContract = await loadJobContractContext(service, {
        tenantId,
        engagementId: contractEngagementId,
        language: tenantRow?.language_default === "he" ? "he" : "en",
      });
      if (jobContract && jobContract.personId !== body.person_id) {
        return jsonResponse({ error: "person_id does not match job" }, 401);
      }
      if (jobContract && (jobContract.engagementStatus === "cancelled" || jobContract.jobStatus === "cancelled")) {
        return jsonResponse({ error: "Job is cancelled" }, 409);
      }
      // Authenticated path: knowing two UUIDs must not let another tenant user
      // sign a client's contract — require membership of the job's account or
      // a tenant admin. (Guest path is already scoped by the waiver token.)
      if (jobContract && !rawWaiverToken && actorId) {
        const [{ data: actorProfile }, { data: memberships }] = await Promise.all([
          service.from("user_profiles").select("role").eq("id", actorId).maybeSingle(),
          service
            .from("account_members")
            .select("account_id")
            .eq("tenant_id", tenantId)
            .eq("user_profile_id", actorId),
        ]);
        const allowed = canSignJobContract({
          roles: (actorProfile?.role as string[] | null) ?? [],
          memberAccountIds: (memberships ?? []).map((m) => m.account_id as string),
          jobAccountId: jobContract.accountId,
        });
        if (!allowed) {
          return jsonResponse({ error: "Not allowed to sign this contract" }, 403);
        }
      }
    }
    const wordingSnapshot: string = jobContract
      ? renderJobContract(template.content as string, jobContract.fields)
      : (template.content as string);

    // --- Fetch student date_of_birth to determine minority status ---
    const { data: student } = await service
      .from("people")
      .select("date_of_birth")
      .eq("id", body.person_id)
      .eq("tenant_id", tenantId)
      .single();

    const isMinor: boolean = student?.date_of_birth
      ? new Date(student.date_of_birth as string) >
        new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
      : false;

    const guardianConfirmed: boolean = body.guardian_confirmed === true;

    if (isMinor && !guardianConfirmed) {
      return jsonResponse(
        {
          error: "guardian_confirmation_required",
          message: "This student is a minor. Guardian confirmation is required.",
        },
        400,
      );
    }

    // --- Guest path: verify body.person_id / offering_id belongs to the token's engagement ---
    let tokenEngagementStatus: string | null = null;
    if (waiverTokenEngagementId) {
      const { data: tokenEng } = await service
        .from("engagements")
        .select("person_id, offering_id, status")
        .eq("id", waiverTokenEngagementId)
        .eq("tenant_id", tenantId)
        .single();
      if (!tokenEng || tokenEng.person_id !== body.person_id) {
        return jsonResponse({ error: "person_id does not match waiver token" }, 401);
      }
      if (offeringId && tokenEng.offering_id !== offeringId) {
        return jsonResponse({ error: "offering_id does not match waiver token" }, 401);
      }
      tokenEngagementStatus = (tokenEng.status as string) ?? null;
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

    // --- Plan 4: block a minor from signing their own waiver (authenticated path only) ---
    // Guest path is exempt — guests signing via magic link are always adult guardians.
    if (!rawWaiverToken && signedByRole === "self" && isMinor) {
      return jsonResponse(
        {
          error: "minor_cannot_self_sign",
          message: "This student is a minor. A parent or legal guardian must sign.",
        },
        403,
      );
    }

    // --- Capture server-side metadata ---
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;
    const acceptLang = req.headers.get("accept-language") ?? null;
    const signedAt = new Date().toISOString();

    // --- Compute hashes ---
    const consent_version_hash = await sha256Hex(wordingSnapshot);

    const evidenceId = crypto.randomUUID();
    const contractLanguage: "he" | "en" = contractTenant?.language_default === "he" ? "he" : "en";

    // --- PDF: job contracts render + upload before the insert; everything else keeps the sentinel ---
    // A replay (same idempotency_key) reuses the stored row instead of rendering again.
    let replay: ExistingWaiverEvidence | null = null;
    let pdf: WaiverPdfArtifact = NO_PDF;
    if (jobContract && contractTenant) {
      replay = await findExistingWaiverEvidence(service, tenantId, body.idempotency_key);
      if (!replay) {
        pdf = await prepareWaiverPdf(service.storage, {
          job: jobContract,
          tenantId,
          tenant: { name: contractTenant.name, logo_url: contractTenant.logo_url },
          language: contractLanguage,
          template: { name: template.name as string, version: template.version as number },
          wordingSnapshot,
          evidenceId,
          typedName: body.typed_name,
          signedAt,
          signerEmail: signedByEmail,
          consentVersionHash: consent_version_hash,
        });
      }
    }
    const storagePath = pdf.storagePath;
    const pdf_sha256 = pdf.pdfSha256;

    // --- record_hmac over the canonical alphabetically-sorted 15-field JSON (SPEC §4.2.9) ---
    const record_hmac = await waiverRecordHmac(hmacKey, {
      accept_language:     acceptLang,
      consent_template_id: body.consent_template_id,
      consent_version:     template.version,
      consent_version_hash,
      guardian_confirmed:  guardianConfirmed,   // 15th field (g sorts between c and i)
      idempotency_key:     body.idempotency_key,
      ip_address:          ip,
      pdf_sha256,
      person_id:           body.person_id,
      signed_at:           signedAt,
      signed_by_email:     signedByEmail,
      signed_by_name:      body.typed_name,
      signed_by_role:      signedByRole,
      tenant_id:           tenantId,
      user_agent:          userAgent,
    });

    // --- Atomic DB write via sign_waiver() SECURITY DEFINER RPC ---
    // (skipped on a job-contract replay: the row already exists and is reused as is)
    const { data: returnedId, error: rpcError } = replay
      ? { data: replay.id, error: null }
      : await service.rpc("sign_waiver", {
      p_id: evidenceId,
      p_tenant_id: tenantId,
      p_person_id: body.person_id,
      p_account_member_id: body.account_member_id ?? null,
      p_consent_template_id: body.consent_template_id,
      p_consent_version: template.version,
      p_consent_version_hash: consent_version_hash,
      p_wording_snapshot: wordingSnapshot,
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
      p_guardian_confirmed: guardianConfirmed,
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

    // Concurrent double submit: sign_waiver returned the row the other request
    // inserted. Reuse it (its PDF is the sealed one); ours is an orphan object.
    if (jobContract && !replay && returnedId !== evidenceId) {
      replay = await findExistingWaiverEvidence(service, tenantId, body.idempotency_key);
      console.warn("[accept-waiver] concurrent replay; orphaned PDF object:", storagePath);
    }

    if (jobContract) {
      // Job contract: the signed record is the contract; the job stays 'active'.
      const { error: linkError } = await service
        .from("engagements")
        .update({ waiver_evidence_id: returnedId })
        .eq("id", jobContract.engagementId)
        .eq("tenant_id", tenantId)
        .is("waiver_evidence_id", null);
      if (linkError) {
        return jsonResponse({ error: "Failed to link contract to job" }, 500);
      }
      // Signed copy to the client and the photographer (idempotent per shoot; never fails the signing).
      if (contractTenant) {
        await notifyJobContractSigned(service, {
          tenant: contractTenant,
          language: contractLanguage,
          job: jobContract,
          evidence: replay
            ? {
              id: replay.id,
              storagePath: replay.pdf_storage_path,
              pdfSha256: replay.pdf_sha256,
              signedAt: new Date(replay.signed_at).toISOString(),
              typedName: replay.signed_by_name,
              signedByEmail: replay.signed_by_email,
            }
            : {
              id: evidenceId,
              storagePath,
              pdfSha256: pdf_sha256,
              signedAt,
              typedName: body.typed_name,
              signedByEmail,
            },
          pdfBytes: replay ? null : pdf.bytes,
        });
      }
    } else if (waiverTokenEngagementId && tokenEngagementStatus === "pending_payment") {
      // Pre-payment tokenized flow: link evidence to this engagement only.
      const { error: linkError } = await service
        .from("engagements")
        .update({ waiver_evidence_id: returnedId })
        .eq("id", waiverTokenEngagementId)
        .eq("tenant_id", tenantId)
        .eq("status", "pending_payment");
      if (linkError) {
        return jsonResponse({ error: "Failed to link waiver to engagement" }, 500);
      }
    } else if (
      body.engagement_id &&
      typeof body.engagement_id === "string"
    ) {
      const { data: authEngagement } = await service
        .from("engagements")
        .select("id, person_id, offering_id, status")
        .eq("id", body.engagement_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (
        authEngagement &&
        authEngagement.person_id === body.person_id &&
        authEngagement.status === "pending_payment" &&
        (!offeringId || authEngagement.offering_id === offeringId)
      ) {
        const { error: linkError } = await service
          .from("engagements")
          .update({ waiver_evidence_id: returnedId })
          .eq("id", body.engagement_id)
          .eq("tenant_id", tenantId)
          .eq("status", "pending_payment");
        if (linkError) {
          return jsonResponse({ error: "Failed to link waiver to engagement" }, 500);
        }
      }
    } else {
      // Existing post-payment flow: activate all pending_waiver engagements for this person.
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
