import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

export interface TenantEmailConfig {
  id: string;
  name: string;
  subdomain: string;
  language: "en" | "he";
  primary_color: string;
  accent_color: string;
  // Sender identity — see _shared/notification-from.ts. Optional so the
  // tenant-not-found fallback below stays constructible; resolveTenantSender()
  // then throws rather than inventing a From address.
  contact_email?: string;
  from_email?: string | null;
  from_email_verified_at?: string | null;
}

const DEFAULT_TENANT: TenantEmailConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "School",
  subdomain: "creativeballet",
  language: "he",
  primary_color: "#76335a",
  accent_color: "#e99ac4",
};

/**
 * Sender identity for auth emails that belong to no studio: the platform host
 * (app.opalswift.com), i.e. the platform owner's account. OpalSwift's own name and
 * brand colours; `id` is empty because there is no tenant.
 */
export function platformEmailConfig(language: "en" | "he" = "en"): TenantEmailConfig {
  return {
    id: "",
    name: "OpalSwift",
    subdomain: "",
    language,
    primary_color: "#4A58E8",
    accent_color: "#21D1C2",
  };
}

export function isPlatformEmailConfig(config: TenantEmailConfig): boolean {
  return config.id === "";
}

export function languageFromLocale(locale: string | null | undefined): "en" | "he" {
  if (!locale) return "en";
  if (locale.startsWith("he")) return "he";
  return "en";
}

export async function getTenantEmailConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantEmailConfig> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, subdomain, language_default, primary_color, accent_color, contact_email, from_email, from_email_verified_at")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    console.warn(`Tenant ${tenantId} not found, using defaults`);
    return { ...DEFAULT_TENANT, id: tenantId };
  }

  return {
    id: data.id,
    name: data.name,
    subdomain: data.subdomain,
    language: data.language_default === "he" ? "he" : "en",
    primary_color: data.primary_color || DEFAULT_TENANT.primary_color,
    accent_color: data.accent_color || DEFAULT_TENANT.accent_color,
    contact_email: data.contact_email,
    from_email: data.from_email,
    from_email_verified_at: data.from_email_verified_at,
  };
}

export async function getTenantBySubdomain(
  supabase: SupabaseClient,
  subdomain: string,
): Promise<TenantEmailConfig | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, subdomain, language_default, primary_color, accent_color, contact_email, from_email, from_email_verified_at")
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    subdomain: data.subdomain,
    language: data.language_default === "he" ? "he" : "en",
    primary_color: data.primary_color || DEFAULT_TENANT.primary_color,
    accent_color: data.accent_color || DEFAULT_TENANT.accent_color,
    contact_email: data.contact_email,
    from_email: data.from_email,
    from_email_verified_at: data.from_email_verified_at,
  };
}

export async function getTenantForAuthUser(
  supabase: SupabaseClient,
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): Promise<TenantEmailConfig> {
  const subdomain = user.user_metadata?.subdomain;
  if (typeof subdomain === "string" && subdomain.length > 0) {
    const bySubdomain = await getTenantBySubdomain(supabase, subdomain);
    if (bySubdomain) return bySubdomain;
  }

  const metaLanguage = user.user_metadata?.language === "he" ? "he" : "en";

  if (user.email) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("tenant_id, language")
      .eq("email", user.email)
      .maybeSingle();

    if (profile?.tenant_id) {
      return getTenantEmailConfig(supabase, profile.tenant_id);
    }
    // A profile with no studio is the platform owner (the only one allowed).
    if (profile) {
      return platformEmailConfig(profile.language === "he" ? "he" : metaLanguage);
    }
  }

  // No studio in the metadata and no studio on the profile: the platform host.
  const fallbackId = Deno.env.get("DEFAULT_TENANT_ID");
  if (fallbackId) {
    const { data: tenant } = await supabase.from("tenants").select("id").eq("id", fallbackId).maybeSingle();
    if (tenant) return getTenantEmailConfig(supabase, fallbackId);
  }
  return platformEmailConfig(metaLanguage);
}

export async function getEmailTemplateOverrides(
  supabase: SupabaseClient,
  tenantId: string,
  templateName: string,
  language: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("tenant_email_customizations")
      .select("overrides")
      .eq("tenant_id", tenantId)
      .eq("template_name", templateName)
      .eq("language", language)
      .maybeSingle();

    if (error || !data?.overrides) {
      return null;
    }

    return data.overrides as Record<string, unknown>;
  } catch (err) {
    console.warn("Could not fetch email overrides:", err);
    return null;
  }
}
