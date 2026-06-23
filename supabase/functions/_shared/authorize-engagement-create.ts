import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export async function assertCanCreateEngagement(
  service: SupabaseClient,
  params: {
    authUserId: string;
    tenantId: string;
    personId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { authUserId, tenantId, personId } = params;

  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("id, tenant_id, role, person_id")
    .eq("id", authUserId)
    .single();

  if (profileError || !profile?.tenant_id) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  if (profile.tenant_id !== tenantId) {
    return { ok: false, error: "Unauthorized for engagement tenant", status: 403 };
  }

  const { data: person, error: personError } = await service
    .from("people")
    .select("id, tenant_id, account_id")
    .eq("id", personId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (personError || !person) {
    return { ok: false, error: "Student not found", status: 404 };
  }

  const roles = Array.isArray(profile.role) ? profile.role : [];
  if (roles.includes("tenant_admin") || roles.includes("super_admin")) {
    return { ok: true };
  }

  if (profile.person_id === personId) {
    return { ok: true };
  }

  const accountId = person.account_id as string | null;
  if (!accountId) {
    return { ok: false, error: "Unauthorized for student", status: 403 };
  }

  const { data: membership } = await service
    .from("account_members")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("user_profile_id", authUserId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Unauthorized for student", status: 403 };
  }

  return { ok: true };
}

export async function assertAdminAgeOverride(
  service: SupabaseClient,
  params: { authUserId: string; tenantId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: profile } = await service
    .from("user_profiles")
    .select("role")
    .eq("id", params.authUserId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  const roles = Array.isArray(profile?.role) ? profile.role : [];
  if (!roles.includes("tenant_admin")) {
    return { ok: false, error: "Only admins can override age requirements", status: 403 };
  }

  return { ok: true };
}
