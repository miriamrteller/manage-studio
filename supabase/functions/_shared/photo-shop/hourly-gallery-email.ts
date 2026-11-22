/**
 * The hourly gallery-ready email (run-shoot-emails), built like "Send gallery"
 * (owner, 22 Nov 2026): ONE button, to the shoot's photo shop when it has one, never
 * to SmugMug; "Sincerely," and the studio's saved signature (else the studio name).
 * Null: nothing safe to send (e.g. only a SmugMug address), so the email is skipped.
 */
import type { createServiceClient } from "../edge-runtime/supabase.ts";
import { EMAIL_TEMPLATE_NAMES, getEmailStrings } from "../email-dist/i18n/email.js";
import { requireFeature } from "../feature-gate.ts";
import type { DueShootEmail } from "../photographer-emails/variables.ts";
import { createShopLink, LINK_DAYS } from "./shop-link.ts";
import { cleanSignature, galleryEmailVariables, planGallerySend } from "./send-gallery.ts";

type Service = ReturnType<typeof createServiceClient>;

export async function hourlyGalleryEmailVariables(
  service: Service,
  row: DueShootEmail,
  tenant: { id: string; name: string },
  language: "en" | "he",
): Promise<Record<string, string> | null> {
  const [shopRow, uploads, settings] = await Promise.all([
    service.from("job_photo_shops")
      .select("provider, gallery_key, gallery_web_url, smugmug_check, smugmug_photos, smugmug_checked_at")
      .eq("tenant_id", tenant.id).eq("engagement_id", row.engagement_id).maybeSingle(),
    service.from("job_photo_shop_photos").select("engagement_id")
      .eq("tenant_id", tenant.id).eq("engagement_id", row.engagement_id).limit(1),
    service.from("tenant_photo_shop_settings").select("email_signature")
      .eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  if (shopRow.error || uploads.error || settings.error) {
    throw new Error((shopRow.error ?? uploads.error ?? settings.error)!.message);
  }

  let shopFeature = true;
  try {
    await requireFeature(tenant.id, "billing:photo_shop", service);
  } catch (res) {
    if (!(res instanceof Response)) throw res;
    shopFeature = false;
  }

  const plan = planGallerySend({
    cancelled: false,
    clientEmail: row.recipient_email,
    galleryUrl: row.gallery_url,
    // deno-lint-ignore no-explicit-any
    shop: (shopRow.data as any) ?? null,
    hasUploads: (uploads.data ?? []).length > 0,
    shopFeature,
  });
  if (!plan.send) return null;

  const shopLink = plan.withShop
    ? await createShopLink(service, { tenantId: tenant.id, engagementId: row.engagement_id, createdBy: null })
    : null;
  if (plan.withShop && !shopLink) return null;

  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.GALLERY_READY);
  const text = (key: string) => (typeof strings[key] === "string" ? strings[key] as string : "");
  return galleryEmailVariables({
    recipientName: row.recipient_name?.trim() || (language === "he" ? "לקוח/ה יקר/ה" : "client"),
    galleryUrl: plan.galleryUrl,
    shopUrl: shopLink?.url ?? null,
    linkDays: LINK_DAYS,
    wording: { body: text("body"), closing: text("closing"), shop_body: text("shop_body"), sign_off: text("sign_off") },
    message: null,
    photo: null,
    signature: cleanSignature((settings.data as { email_signature?: unknown } | null)?.email_signature) ??
      cleanSignature(tenant.name),
  });
}
