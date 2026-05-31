import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export interface TenantEmailConfig {
  id: string;
  name: string;
  subdomain: string;
  language: "en" | "he";
  primary_color: string;
  accent_color: string;
}

const DEFAULT_TENANT: TenantEmailConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "School",
  subdomain: "creativeballet",
  language: "he",
  primary_color: "#76335a",
  accent_color: "#e99ac4",
};

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
    .select("id, name, subdomain, language_default, primary_color, accent_color")
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
  };
}

export async function getTenantBySubdomain(
  supabase: SupabaseClient,
  subdomain: string,
): Promise<TenantEmailConfig | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, subdomain, language_default, primary_color, accent_color")
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

  if (user.email) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("tenant_id")
      .eq("email", user.email)
      .maybeSingle();

    if (profile?.tenant_id) {
      return getTenantEmailConfig(supabase, profile.tenant_id);
    }
  }

  const fallbackId = Deno.env.get("DEFAULT_TENANT_ID") || DEFAULT_TENANT.id;
  return getTenantEmailConfig(supabase, fallbackId);
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
