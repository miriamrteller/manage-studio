import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

export type EmailLanguage = "en" | "he";

export function parseEmailLanguage(value: unknown): EmailLanguage | null {
  return value === "he" || value === "en" ? value : null;
}

/**
 * The language a client email goes out in. Each client gets every email in one
 * language: the one they last used OpalSwift in.
 *
 * Order: the client's login language (what the app shows them when signed in) →
 * the language their browser was in when they last booked, enrolled, ordered or
 * sent a form (people.language) → the studio's default → Hebrew.
 *
 * Give personId when known; otherwise the client is found by email in the studio.
 * A lead (not yet a client) gets the language they sent the studio's form in.
 * Give tenantDefault when the caller already has the studio row (saves a query).
 */
export async function resolveEmailLanguage(
  service: SupabaseClient,
  input: {
    tenantId: string;
    personId?: string | null;
    email?: string | null;
    /** The recipient's login, when known (e.g. a sign-in email). */
    userId?: string | null;
    tenantDefault?: string | null;
  },
): Promise<EmailLanguage> {
  try {
    if (input.userId) {
      const { data: profile } = await service
        .from("user_profiles")
        .select("language")
        .eq("id", input.userId)
        .maybeSingle();
      const profileLang = parseEmailLanguage(profile?.language);
      if (profileLang) return profileLang;
    }

    let person: { language?: unknown; user_profile_id?: unknown; email?: unknown } | null = null;
    if (input.personId) {
      const { data } = await service
        .from("people")
        .select("language, user_profile_id, email")
        .eq("id", input.personId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      person = data;
    } else {
      const email = input.email?.trim().toLowerCase();
      if (email) {
        const { data } = await service
          .from("people")
          .select("language, user_profile_id, email")
          .eq("tenant_id", input.tenantId)
          .eq("email", email)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        person = data;
      }
    }

    if (person?.user_profile_id) {
      const { data: profile } = await service
        .from("user_profiles")
        .select("language")
        .eq("id", person.user_profile_id as string)
        .maybeSingle();
      const profileLang = parseEmailLanguage(profile?.language);
      if (profileLang) return profileLang;
    }

    const personLang = parseEmailLanguage(person?.language);
    if (personLang) return personLang;

    const email = (input.email ?? (person as { email?: unknown } | null)?.email);
    if (typeof email === "string" && email.trim()) {
      const { data: lead } = await service
        .from("leads")
        .select("language")
        .eq("tenant_id", input.tenantId)
        .eq("email", email.trim().toLowerCase())
        .not("language", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const leadLang = parseEmailLanguage(lead?.language);
      if (leadLang) return leadLang;
    }
  } catch (err) {
    // Never stop an email over its language: fall back to the studio's.
    console.warn("[resolveEmailLanguage]", err);
  }

  return tenantEmailLanguage(service, input);
}

async function tenantEmailLanguage(
  service: SupabaseClient,
  input: { tenantId: string; tenantDefault?: string | null },
): Promise<EmailLanguage> {
  if (input.tenantDefault !== undefined) {
    return parseEmailLanguage(input.tenantDefault) ?? "he";
  }
  const { data: tenant } = await service
    .from("tenants")
    .select("language_default")
    .eq("id", input.tenantId)
    .maybeSingle();
  return parseEmailLanguage(tenant?.language_default) ?? "he";
}

/**
 * Saves the language the client's browser was in (sent by the web app as
 * `clientLanguage`) on their client record, so later emails use it. The client is
 * the person given, or the studio's client with that email. Best effort: never
 * throws, never blocks a booking, order or payment.
 */
export async function rememberClientLanguage(
  service: SupabaseClient,
  input: {
    tenantId: string;
    personId?: string | null;
    email?: string | null;
    language: unknown;
  },
): Promise<void> {
  const language = parseEmailLanguage(input.language);
  const email = input.email?.trim().toLowerCase();
  if (!language || (!input.personId && !email)) return;
  try {
    let update = service.from("people").update({ language }).eq("tenant_id", input.tenantId);
    update = input.personId ? update.eq("id", input.personId) : update.eq("email", email as string);
    const { error } = await update;
    if (error) console.warn("[rememberClientLanguage]", error.message);
  } catch (err) {
    console.warn("[rememberClientLanguage]", err);
  }
}
