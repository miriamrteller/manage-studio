/**
 * The 3-day photo shop link (/shop/<token>) that signs a shoot's client straight in.
 * Used by "Email shop link to client" (photo-shop-link) and "Send gallery"
 * (send-shoot-gallery). Only sha256(token) is stored, in photo_shop_links.
 */
import type { createServiceClient } from "../edge-runtime/supabase.ts";
import { tenantBaseUrlFor } from "../tenant-url.ts";

type Service = ReturnType<typeof createServiceClient>;

export const LINK_DAYS = 3;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Makes a new link for the shoot. null when it could not be saved. */
export async function createShopLink(
  service: Service,
  input: { tenantId: string; engagementId: string; createdBy: string },
): Promise<{ url: string; expiresAt: string } | null> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from("photo_shop_links").insert({
    tenant_id: input.tenantId,
    engagement_id: input.engagementId,
    token_hash: await sha256Hex(token),
    created_by: input.createdBy,
    expires_at: expiresAt,
  });
  if (error) return null;
  const base = await tenantBaseUrlFor(service, input.tenantId);
  return { url: `${base}/shop/${token}`, expiresAt };
}
