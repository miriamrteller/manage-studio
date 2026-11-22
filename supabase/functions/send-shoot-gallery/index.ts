/**
 * send-shoot-gallery: "Send gallery" on the shoots list and a shoot's page
 * (owner, 18 Nov 2026), for one shoot or several selected at once.
 *
 * Authorization: Bearer <supabase session> (studio admin)
 * Body: { engagementIds: string[], resend?: boolean, message?: string, photoUrl?: string, photoAlt?: string }
 *   (1 to 100 shoots of the admin's studio)
 *   resend false (the default, sending several): a client who already got the
 *   gallery email is skipped as "already_sent". resend true (one shoot's button,
 *   which shows when it was last sent): it goes again.
 *   message: the studio's own words in place of the standard body paragraph (plain
 *   text, cleaned by cleanGalleryMessage). The greeting, the gallery button, the photo
 *   shop steps and the closing line stay as they are, so the links can never be lost.
 *   photoUrl / photoAlt: one photo under that paragraph, the same for every client in
 *   the send. Only the studio's own upload (galleryEmailPhotoUrl); a hosted image, not an
 *   attachment.
 * Response: { sent, skipped, failed, results: [{ engagementId, outcome }] }
 *
 * For each shoot it sends the client the gallery-ready email now, with ONE button
 * ("Open your gallery"). When the shoot has a photo shop ready, that button is the 3-day
 * photo shop sign-in link (the same link as "Email shop link to client") and the order
 * steps sit under it; the SmugMug address is never in the email. Without a photo shop
 * the button opens the gallery link the studio set. Then it opens the gallery to the
 * client (as "release anyway" does) and moves the shoot to Delivered, as the hourly
 * job would once the client has the gallery.
 *
 * Skipped (never sent): cancelled shoots, no client email, a SmugMug gallery whose
 * "Check gallery" has not passed, and shoots with no gallery and no photo shop
 * (_shared/photo-shop/send-gallery.ts).
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { requireFeature } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { EMAIL_TEMPLATE_NAMES, getEmailStrings } from "../_shared/email-dist/i18n/email.js";
import {
  AUTOMATIC_EMAIL_TENANT_COLUMNS,
  type AutomaticEmailTenant,
  sendAutomaticEmail,
} from "../_shared/photographer-emails/send.ts";
import { createShopLink, LINK_DAYS } from "../_shared/photo-shop/shop-link.ts";
import {
  cleanGalleryMessage,
  cleanPhotoAlt,
  galleryEmailPhotoUrl,
  galleryEmailVariables,
  planGallerySend,
  type SendGallerySkip,
} from "../_shared/photo-shop/send-gallery.ts";

const MAX_SHOOTS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Outcome = "sent" | "failed" | "already_sent" | SendGallerySkip;


Deno.serve(withMonitoring("send-shoot-gallery", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = (await req.json().catch(() => null)) as {
    engagementIds?: unknown;
    resend?: unknown;
    message?: unknown;
    photoUrl?: unknown;
    photoAlt?: unknown;
  } | null;
  const resend = body?.resend === true;
  const raw = Array.isArray(body?.engagementIds) ? body.engagementIds : [];
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  if (ids.length === 0 || ids.length !== raw.length || ids.length > MAX_SHOOTS) {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId || !roles.includes("tenant_admin")) return jsonResponse({ error: "forbidden" }, 403);

  // Everything for the selected shoots, limited to this studio.
  const [engagements, details, shops, photos, tenantRow, sentLog] = await Promise.all([
    service.from("engagements").select("id, status, people:person_id(name, email)")
      .eq("tenant_id", tenantId).in("id", ids),
    service.from("job_details").select("engagement_id, job_status, auto_status, gallery_url, gallery_released_at, gallery_shared_at")
      .eq("tenant_id", tenantId).in("engagement_id", ids),
    service.from("job_photo_shops")
      .select("engagement_id, provider, gallery_key, gallery_web_url, smugmug_check, smugmug_photos, smugmug_checked_at")
      .eq("tenant_id", tenantId).in("engagement_id", ids),
    service.from("job_photo_shop_photos").select("engagement_id")
      .eq("tenant_id", tenantId).in("engagement_id", ids),
    service.from("tenants").select(AUTOMATIC_EMAIL_TENANT_COLUMNS).eq("id", tenantId).single(),
    service.from("automatic_email_log").select("engagement_id")
      .eq("tenant_id", tenantId).eq("email_key", "gallery_ready").eq("status", "sent").in("engagement_id", ids),
  ]);
  const loadError = engagements.error ?? details.error ?? shops.error ?? photos.error ?? tenantRow.error ??
    sentLog.error;
  if (loadError) {
    console.error("[send-shoot-gallery] load:", loadError.message);
    return jsonResponse({ error: "server_error" }, 500);
  }
  const tenant = tenantRow.data as unknown as AutomaticEmailTenant;
  const language = tenant.language_default === "he" ? "he" : "en";
  // The box was prefilled with the standard body in the email's language.
  const standardBody = String(getEmailStrings(language, EMAIL_TEMPLATE_NAMES.GALLERY_READY).body ?? "");
  const message = cleanGalleryMessage(body?.message, standardBody);
  const photoUrl = galleryEmailPhotoUrl(body?.photoUrl, Deno.env.get("SUPABASE_URL") ?? "", tenantId);
  const photo = photoUrl ? { url: photoUrl, alt: cleanPhotoAlt(body?.photoAlt, tenant.name) } : null;
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.GALLERY_READY);
  const wording = {
    body: standardBody,
    closing: typeof strings.closing === "string" ? strings.closing : "",
    shop_body: typeof strings.shop_body === "string" ? strings.shop_body : "",
  };

  let shopFeature = true;
  try {
    await requireFeature(tenantId, "billing:photo_shop", service);
  } catch (res) {
    if (!(res instanceof Response)) throw res;
    shopFeature = false;
  }

  // deno-lint-ignore no-explicit-any
  const engagementById = new Map((engagements.data ?? []).map((e: any) => [e.id as string, e]));
  // deno-lint-ignore no-explicit-any
  const detailById = new Map((details.data ?? []).map((d: any) => [d.engagement_id as string, d]));
  // deno-lint-ignore no-explicit-any
  const shopById = new Map((shops.data ?? []).map((s: any) => [s.engagement_id as string, s]));
  // deno-lint-ignore no-explicit-any
  const withUploads = new Set((photos.data ?? []).map((p: any) => p.engagement_id as string));
  // deno-lint-ignore no-explicit-any
  const alreadySent = new Set((sentLog.data ?? []).map((l: any) => l.engagement_id as string));

  const results: Array<{ engagementId: string; outcome: Outcome }> = [];
  for (const engagementId of ids) {
    const engagement = engagementById.get(engagementId);
    const detail = detailById.get(engagementId);
    if (!engagement || !detail) {
      results.push({ engagementId, outcome: "not_found" });
      continue;
    }
    const email = typeof engagement.people?.email === "string" ? engagement.people.email.trim() : "";
    const plan = planGallerySend({
      cancelled: engagement.status === "cancelled" || detail.job_status === "cancelled",
      clientEmail: email,
      galleryUrl: detail.gallery_url ?? null,
      shop: shopById.get(engagementId) ?? null,
      hasUploads: withUploads.has(engagementId),
      shopFeature,
    });
    if (!plan.send) {
      results.push({ engagementId, outcome: plan.reason });
      continue;
    }
    if (!resend && alreadySent.has(engagementId)) {
      results.push({ engagementId, outcome: "already_sent" });
      continue;
    }

    try {
      const shopLink = plan.withShop
        ? await createShopLink(service, { tenantId, engagementId, createdBy: auth.user.id })
        : null;
      // A shop that should be in the email but whose link could not be made: never fall
      // back to the SmugMug address. "failed", so the studio can press again.
      if (plan.withShop && !shopLink) {
        results.push({ engagementId, outcome: "failed" });
        continue;
      }
      const name = typeof engagement.people?.name === "string" ? engagement.people.name.trim() : "";
      const variables = galleryEmailVariables({
        recipientName: name || (language === "he" ? "לקוח/ה יקר/ה" : "there"),
        galleryUrl: plan.galleryUrl,
        shopUrl: shopLink?.url ?? null,
        linkDays: LINK_DAYS,
        wording,
        message,
        photo,
      });
      if (!variables) {
        results.push({ engagementId, outcome: "failed" });
        continue;
      }
      const outcome = await sendAutomaticEmail(service, {
        tenant,
        key: "gallery_ready",
        engagementId,
        to: email,
        force: true,
        variables,
      });
      if (outcome !== "sent") {
        results.push({ engagementId, outcome: "failed" });
        continue;
      }

      // The client has the gallery now: open it on their page and move the shoot on.
      const now = new Date().toISOString();
      // A resend keeps the one log row per shoot; its time is "last sent" on the button.
      await service.from("automatic_email_log")
        .update({ status: "sent", recipient_email: email, updated_at: now })
        .eq("email_key", "gallery_ready").eq("engagement_id", engagementId).eq("tenant_id", tenantId);
      const patch: Record<string, unknown> = {};
      if (plan.galleryUrl) {
        if (!detail.gallery_url) patch.gallery_url = plan.galleryUrl;
        if (!detail.gallery_released_at) patch.gallery_released_at = now;
        if (!detail.gallery_shared_at) patch.gallery_shared_at = now;
      }
      if (["booked", "shot", "editing"].includes(detail.job_status) && detail.auto_status !== "delivered") {
        patch.job_status = "delivered";
        patch.auto_status = "delivered";
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await service.from("job_details").update(patch)
          .eq("engagement_id", engagementId).eq("tenant_id", tenantId);
        if (error) console.error(`[send-shoot-gallery] update ${engagementId}:`, error.message);
      }
      results.push({ engagementId, outcome: "sent" });
    } catch (error) {
      console.error(`[send-shoot-gallery] ${engagementId}:`, error);
      results.push({ engagementId, outcome: "failed" });
    }
  }

  const sent = results.filter((r) => r.outcome === "sent").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  return jsonResponse({ sent, failed, skipped: results.length - sent - failed, results });
}));
