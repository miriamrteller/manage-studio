import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/** Old error code for "legal pack not confirmed"; no longer returned (signing never waits for it). */
export const STUDIO_LEGAL_NOT_READY = "studio_legal_not_ready";

/**
 * Whether a studio's draft legal pack is confirmed: studios created before the
 * legal pack (legal_pack_required = false) always are; newer ones once an admin
 * has acknowledged the draft documents. This only decides whether the legal
 * pages are published: signing and paying never wait for it.
 */
export function isStudioLegalReady(row: { legal_pack_required?: boolean | null; legal_pack_acknowledged_at?: string | null } | null): boolean {
  if (!row) return true;
  return row.legal_pack_required !== true || Boolean(row.legal_pack_acknowledged_at);
}

export async function studioLegalReady(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await service
    .from("tenants")
    .select("legal_pack_required, legal_pack_acknowledged_at")
    .eq("id", tenantId)
    .maybeSingle();
  return isStudioLegalReady(data as { legal_pack_required?: boolean; legal_pack_acknowledged_at?: string | null } | null);
}

export interface ActiveConsentTemplate {
  id: string;
  version: number;
  name: string;
  content: string;
  audience: "child" | "adult" | null;
  language: "he" | "en" | null;
}

/** The reader's language from a request value; anything else means "the studio's language". */
export function readerLanguage(value: unknown): "he" | "en" | null {
  return value === "he" || value === "en" ? value : null;
}

/**
 * The active form this participant signs: the child or adult health declaration
 * by age, in the reader's language when the studio has it, or the studio's
 * single form (pick_active_consent_template).
 */
export async function pickActiveConsentTemplate(
  service: SupabaseClient,
  tenantId: string,
  personId: string | null | undefined,
  language: "he" | "en" | null = null,
): Promise<ActiveConsentTemplate | null> {
  const { data, error } = await service
    .rpc("pick_active_consent_template", { p_tenant_id: tenantId, p_person_id: personId ?? null, p_language: language })
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ActiveConsentTemplate;
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    content: row.content,
    audience: row.audience ?? null,
    language: row.language ?? null,
  };
}

/**
 * Whether a signature still counts for the participant's current form. The
 * same form exists in several languages: a signature on any language version
 * counts while that version is active, is the signed version, and is for the
 * same audience (child / adult) as the participant's current form.
 */
export function signatureMatchesActiveForm(
  active: Pick<ActiveConsentTemplate, "id" | "version" | "audience">,
  signed: { id: string; version: number; status: string; audience: string | null } | null,
  signedVersion: number,
): boolean {
  if (!signed) return false;
  if (signed.id === active.id) return signed.version === signedVersion && active.version === signedVersion;
  return signed.status === "active" && signed.version === signedVersion && (signed.audience ?? null) === (active.audience ?? null);
}
