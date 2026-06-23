import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export type EmailLanguage = "en" | "he";

function parseLanguage(value: unknown): EmailLanguage | null {
  return value === "he" || value === "en" ? value : null;
}

/**
 * Resolved language for outbound email: user profile → tenant default → 'he'.
 */
export async function resolveEmailLanguage(
  service: SupabaseClient,
  input: { tenantId: string; personId: string },
): Promise<EmailLanguage> {
  const [{ data: person }, { data: tenant }] = await Promise.all([
    service
      .from("people")
      .select("user_profile_id")
      .eq("id", input.personId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
    service
      .from("tenants")
      .select("language_default")
      .eq("id", input.tenantId)
      .maybeSingle(),
  ]);

  if (person?.user_profile_id) {
    const { data: profile } = await service
      .from("user_profiles")
      .select("language")
      .eq("id", person.user_profile_id as string)
      .maybeSingle();

    const profileLang = parseLanguage(profile?.language);
    if (profileLang) return profileLang;
  }

  const tenantLang = parseLanguage(tenant?.language_default);
  return tenantLang ?? "he";
}
