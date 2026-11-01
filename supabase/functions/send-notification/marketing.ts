import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { signUnsubscribeToken } from "../_shared/unsubscribe-token.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";

// --- Marketing (Communications Law §30A) -----------------------------------

/** Marketing subject must say it is an advertisement ("פרסומת"). */
export function withAdvertisementPrefix(subject: string): string {
  return /^\s*פרסומת/.test(subject) ? subject : `פרסומת: ${subject}`;
}

export interface MarketingFooterContext {
  subdomain: string;
  address: string | null;
  phone: string | null;
}

export async function loadMarketingFooterContext(
  service: SupabaseClient,
  tenantId: string,
): Promise<MarketingFooterContext> {
  const { data } = await service
    .from("tenants")
    .select("subdomain, legal_profile")
    .eq("id", tenantId)
    .single();
  const profile = (data?.legal_profile ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    subdomain: data?.subdomain as string,
    address: text(profile.address),
    phone: text(profile.phone),
  };
}

/** Footer: who is sending, how to reach them, and a one-click unsubscribe link. */
export async function buildMarketingFooter(
  service: SupabaseClient,
  ctx: MarketingFooterContext,
  input: { tenantId: string; personId: string; language: string; studioName: string },
): Promise<string> {
  const token = await signUnsubscribeToken(service, {
    v: 1,
    tid: input.tenantId,
    pid: input.personId,
    ch: "email",
  });
  const url = `${tenantBaseUrl(ctx.subdomain)}/unsubscribe/${token}`;
  const details = [input.studioName, ctx.address, ctx.phone].filter(Boolean).join(", ");
  return input.language === "he"
    ? `\n\n—\nהודעה זו נשלחה אליך כי הסכמת לקבל עדכונים מ-${details}.\nלהסרה מרשימת התפוצה: ${url}`
    : `\n\n—\nYou are receiving this because you agreed to hear from ${details}.\nUnsubscribe: ${url}`;
}
