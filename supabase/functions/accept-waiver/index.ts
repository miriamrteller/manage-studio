import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
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

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 16;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_HEADER = 14;

/** Word-wrap text to fit within maxWidth at the given font size. */
async function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
  maxWidth: number,
): Promise<string[]> {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function buildPdf(params: {
  tenantName: string;
  templateName: string;
  content: string;
  typedName: string;
  signedAt: string;
  ip: string | null;
  templateVersion: number;
  consentVersionHash: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const usableWidth = PAGE_WIDTH - MARGIN * 2;

  const contentLines = await wrapText(
    params.content,
    regularFont,
    FONT_SIZE_BODY,
    usableWidth,
  );

  // Estimate total lines including headers + signature block
  const HEADER_LINES = 5;
  const SIG_LINES = 6;
  const allLines = HEADER_LINES + contentLines.length + SIG_LINES;
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LINE_HEIGHT);
  const totalPages = Math.ceil(allLines / linesPerPage);

  let lineIndex = 0;
  let pageNum = 0;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    pageNum++;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    // Footer
    page.drawText(
      `Content SHA-256: ${params.consentVersionHash} | Page ${pageNum} of ${totalPages}`,
      {
        x: MARGIN,
        y: MARGIN / 2,
        size: 7,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      },
    );
  }

  // Draw footer on first page
  pageNum = 1;
  page.drawText(
    `Content SHA-256: ${params.consentVersionHash} | Page ${pageNum} of ${totalPages}`,
    {
      x: MARGIN,
      y: MARGIN / 2,
      size: 7,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    },
  );

  function drawLine(text: string, bold = false, size = FONT_SIZE_BODY) {
    if (y - LINE_HEIGHT < MARGIN) newPage();
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: bold ? boldFont : regularFont,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  }

  // Header
  drawLine(params.tenantName, true, FONT_SIZE_HEADER);
  drawLine(params.templateName, false, FONT_SIZE_BODY + 1);
  y -= LINE_HEIGHT / 2;
  drawLine("─".repeat(80), false, 8);
  y -= LINE_HEIGHT / 2;

  // Body content
  for (const line of contentLines) {
    drawLine(line);
  }

  // Signature block
  y -= LINE_HEIGHT;
  drawLine("─".repeat(80), false, 8);
  drawLine(`Signed by: ${params.typedName}`, true);
  drawLine(`Date (UTC): ${params.signedAt}`);
  drawLine(`IP address: ${params.ip ?? "unknown"}`);
  drawLine(`Template version: ${params.templateVersion}`);

  return doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();

    const { data: { user }, error: authError } = await service.auth.getUser(jwt);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Derive tenant_id + email from user_profiles
    const { data: profile } = await service
      .from("user_profiles")
      .select("tenant_id, email")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
    const tenantId = profile.tenant_id as string;

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

    // --- Capture server-side metadata ---
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;
    const acceptLang = req.headers.get("accept-language") ?? null;
    const signedAt = new Date().toISOString();

    // --- Determine signer role ---
    const { data: signerProfile } = await service
      .from("user_profiles")
      .select("person_id")
      .eq("id", user.id)
      .single();
    const isSelf = signerProfile?.person_id === body.person_id;
    const signedByRole: string = isSelf ? "self" : "guardian";
    const signedByEmail: string | null = (profile.email as string) ?? null;

    // --- Load tenant name for PDF header ---
    const { data: tenant } = await service
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();
    const tenantName = tenant?.name ?? "Studio";

    // --- Generate PDF in-process ---
    const pdfBytes = await buildPdf({
      tenantName,
      templateName: template.name as string,
      content: template.content as string,
      typedName: body.typed_name,
      signedAt,
      ip,
      templateVersion: template.version as number,
      consentVersionHash: await sha256Hex(template.content as string),
    });

    // --- Compute hashes ---
    const pdf_sha256 = await sha256Hex(pdfBytes);
    const consent_version_hash = await sha256Hex(template.content as string);

    // --- Pre-generate evidence UUID and storage path ---
    const evidenceId = crypto.randomUUID();
    const storagePath = `${tenantId}/${body.person_id}/${evidenceId}.pdf`;

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

    // --- Upload PDF FIRST (before DB write) ---
    const { error: uploadError } = await service.storage
      .from("waiver-pdfs")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

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
      p_actor_id: user.id,
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

    return jsonResponse({ evidence_id: returnedId, signed_at: signedAt });
  } catch (err) {
    console.error("[accept-waiver]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
