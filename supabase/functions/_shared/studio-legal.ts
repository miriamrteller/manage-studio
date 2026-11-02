import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/** Error code returned while a studio's draft legal pack is not acknowledged yet. */
export const STUDIO_LEGAL_NOT_READY = "studio_legal_not_ready";

/**
 * Whether a studio may collect signatures: studios created before the legal
 * pack (legal_pack_required = false) always may; newer ones once an admin has
 * acknowledged the draft documents.
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
