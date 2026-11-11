/**
 * Client logins: every booked client gets a login at their studio, made for them, so
 * they can sign in without a password (owner, 11 Nov 2026: "every booked client needs to
 * automatically get an account and sign in").
 *
 * - ensureClientLogin: finds or makes the client's login at this studio (as signing in by
 *   email at the studio would) and links it to their client record and family account.
 *   No email is sent. It never makes or touches a staff, admin, platform-owner or
 *   other-studio login.
 * - newClientSignInLink / openClientSignInLink: a sign-in link valid for 3 days, for the
 *   booking confirmation email. Only sha256(token) is stored, in client_sign_in_links,
 *   and the token rides in the URL fragment, which browsers never send to a server.
 * - clientHasBooking: whether an email is a booked client (or the payer of one) at a
 *   studio, so the login page can make their login before sending the sign-in email.
 *
 * Callers on a booking or payment path must treat every failure here as "no login yet":
 * nothing here may stand in the way of booking or paying.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { inviteTokenHash, newInviteToken } from "./lead-form-invite.ts";

/** Sign-in links in booking emails work for 3 days, like the photo shop link. */
export const SIGN_IN_LINK_DAYS = 3;

/** Roles a client sign-in must never reach. */
export const STAFF_ROLES = ["tenant_admin", "super_admin", "staff"];

export type EnsureClientLoginResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "no_email" | "no_studio" | "not_a_client_login" | "failed" };

export function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** For ilike: match the email literally (no % or _ wildcards). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface ProfileRow {
  id: string;
  tenant_id: string | null;
  role: string[] | null;
}

/**
 * Which existing login (if any) a client sign-in may use. Refuses when the email has a
 * login at another studio (one login, one studio) or a staff/admin/owner login.
 */
export function pickClientProfile(
  rows: ProfileRow[],
  tenantId: string,
): { kind: "none" } | { kind: "existing"; id: string } | { kind: "refused" } {
  if (rows.some((p) => p.tenant_id !== tenantId || (p.role ?? []).some((r) => STAFF_ROLES.includes(r)))) {
    return { kind: "refused" };
  }
  return rows.length === 0 ? { kind: "none" } : { kind: "existing", id: rows[0].id };
}

export async function ensureClientLogin(
  service: SupabaseClient,
  params: { tenantId: string; email: string },
): Promise<EnsureClientLoginResult> {
  const email = normaliseEmail(params.email);
  if (!email || !email.includes("@")) return { ok: false, reason: "no_email" };

  const { data: tenant } = await service
    .from("tenants")
    .select("subdomain")
    .eq("id", params.tenantId)
    .maybeSingle();
  const subdomain = (tenant?.subdomain as string | null) ?? null;
  if (!subdomain) return { ok: false, reason: "no_studio" };

  const { data: profiles, error: profileError } = await service
    .from("user_profiles")
    .select("id, tenant_id, role")
    .ilike("email", escapeLike(email));
  if (profileError) return { ok: false, reason: "failed" };

  const pick = pickClientProfile((profiles ?? []) as ProfileRow[], params.tenantId);
  if (pick.kind === "refused") return { ok: false, reason: "not_a_client_login" };

  let userId: string;
  let created = false;
  if (pick.kind === "existing") {
    userId = pick.id;
  } else {
    // The same login signing in by email at the studio would make: handle_new_user
    // gives it this studio and the studio's client role. Confirmed, so no email goes out.
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { subdomain },
    });
    if (error || !data?.user?.id) {
      // An auth user with no studio profile (e.g. from the platform host): leave it.
      return { ok: false, reason: "failed" };
    }
    userId = data.user.id;
    created = true;
  }

  await linkClientLogin(service, { tenantId: params.tenantId, email, userId });
  return { ok: true, userId, created };
}

/**
 * Links the login to the client's own record and to family accounts that carry their
 * email, the same rows signing in would link (link_auth_user_to_person,
 * link_my_guardian_accounts). Never changes an existing link.
 */
async function linkClientLogin(
  service: SupabaseClient,
  params: { tenantId: string; email: string; userId: string },
): Promise<void> {
  const { data: people } = await service
    .from("people")
    .select("id, account_id")
    .eq("tenant_id", params.tenantId)
    .ilike("email", escapeLike(params.email));
  const rows = (people ?? []) as Array<{ id: string; account_id: string | null }>;
  if (rows.length === 0) return;

  const { data: tenant } = await service
    .from("tenants")
    .select("business_preset")
    .eq("id", params.tenantId)
    .maybeSingle();
  const preset = (tenant?.business_preset as string | null) ?? "programs";
  const linkPersonDirectly = preset === "services" || preset === "catalog";

  const personIds = rows.filter((p) => !p.account_id || linkPersonDirectly).map((p) => p.id);
  if (personIds.length > 0) {
    await service
      .from("people")
      .update({ user_profile_id: params.userId, updated_at: new Date().toISOString() })
      .eq("tenant_id", params.tenantId)
      .in("id", personIds)
      .is("user_profile_id", null);
  }

  await service
    .from("account_members")
    .update({ user_profile_id: params.userId })
    .eq("tenant_id", params.tenantId)
    .in("person_id", rows.map((p) => p.id))
    .in("role", ["account_holder", "member"])
    .is("user_profile_id", null);
}

/**
 * Whether this email is a booked client at the studio: their own record has a booking or
 * enrolment, or they hold the family account of someone who does.
 */
export async function clientHasBooking(
  service: SupabaseClient,
  params: { tenantId: string; email: string },
): Promise<boolean> {
  const email = normaliseEmail(params.email);
  if (!email) return false;

  const { data: people } = await service
    .from("people")
    .select("id, account_id")
    .eq("tenant_id", params.tenantId)
    .ilike("email", escapeLike(email));
  const rows = (people ?? []) as Array<{ id: string; account_id: string | null }>;
  if (rows.length === 0) return false;

  const personIds = new Set(rows.map((p) => p.id));
  const accountIds = rows.map((p) => p.account_id).filter((id): id is string => !!id);
  if (accountIds.length > 0) {
    const { data: holders } = await service
      .from("account_members")
      .select("account_id")
      .eq("tenant_id", params.tenantId)
      .in("person_id", [...personIds])
      .eq("role", "account_holder");
    const heldAccounts = ((holders ?? []) as Array<{ account_id: string }>).map((h) => h.account_id);
    if (heldAccounts.length > 0) {
      const { data: family } = await service
        .from("people")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .in("account_id", heldAccounts);
      for (const f of (family ?? []) as Array<{ id: string }>) personIds.add(f.id);
    }
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .in("person_id", [...personIds])
    .limit(1)
    .maybeSingle();
  return Boolean(engagement?.id);
}

/** The studio page that opens a sign-in link. The token is in the fragment. */
export function clientSignInUrl(tenantBase: string, token: string): string {
  return `${tenantBase.replace(/\/$/, "")}/signin#t=${encodeURIComponent(token)}`;
}

/** A token as the sign-in page sends it: base64url, 32–128 characters, else null. */
export function cleanSignInToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(t) ? t : null;
}

/** A new 3-day sign-in link for this login. Returns the raw token (store only its hash). */
export async function newClientSignInLink(
  service: SupabaseClient,
  params: { tenantId: string; userId: string; engagementId?: string | null },
): Promise<string | null> {
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + SIGN_IN_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from("client_sign_in_links").insert({
    tenant_id: params.tenantId,
    user_profile_id: params.userId,
    engagement_id: params.engagementId ?? null,
    token_hash: await inviteTokenHash(token),
    expires_at: expiresAt,
  });
  return error ? null : token;
}

export type OpenSignInLinkResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; code: "expired" | "sign_in" };

/** Opens a sign-in link: a normal session for the client's own login at the studio. */
export async function openClientSignInLink(
  service: SupabaseClient,
  token: string,
): Promise<OpenSignInLinkResult> {
  const { data: link } = await service
    .from("client_sign_in_links")
    .select("id, tenant_id, user_profile_id, expires_at")
    .eq("token_hash", await inviteTokenHash(token))
    .maybeSingle();
  if (!link || new Date(link.expires_at as string).getTime() < Date.now()) {
    return { ok: false, code: "expired" };
  }

  // Check again: the login must still be a client login at this studio.
  const { data: profile } = await service
    .from("user_profiles")
    .select("id, tenant_id, role, email")
    .eq("id", link.user_profile_id as string)
    .maybeSingle();
  const row = profile as (ProfileRow & { email: string | null }) | null;
  if (!row?.email || pickClientProfile([row], link.tenant_id as string).kind !== "existing") {
    return { ok: false, code: "sign_in" };
  }

  const session = await sessionForEmail(service, row.email);
  if (!session) return { ok: false, code: "sign_in" };

  await service
    .from("client_sign_in_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", link.id);
  return { ok: true, ...session };
}

/** A normal session for an existing login, made on the server (magic link, verified here). */
export async function sessionForEmail(
  service: SupabaseClient,
  email: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  const { data: generated, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed = generated?.properties?.hashed_token;
  if (linkError || !hashed) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: hashed, type: "email" });
  const session = verified?.session;
  if (verifyError || !session) return null;
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

/**
 * For booking emails: make sure the client has a login, then a 3-day sign-in link to
 * their page. Null on any failure (the email then goes without the button).
 */
export async function clientSignInUrlFor(
  service: SupabaseClient,
  params: { tenantId: string; email: string; engagementId?: string | null; tenantBase: string },
): Promise<string | null> {
  try {
    const login = await ensureClientLogin(service, params);
    if (!login.ok) return null;
    const token = await newClientSignInLink(service, {
      tenantId: params.tenantId,
      userId: login.userId,
      engagementId: params.engagementId,
    });
    return token ? clientSignInUrl(params.tenantBase, token) : null;
  } catch (err) {
    console.error("[client-login] sign-in link failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
