import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import type { UserProfile } from '@/types/auth';

/**
 * Tenant membership: a signed-in user may only act on the tenant their
 * profile belongs to — the profile's tenant_id must equal the tenant
 * resolved from the subdomain, no exceptions. There is deliberately NO
 * role-based bypass here (not even super_admin): dev/demo accounts have
 * carried super_admin in the past, and any bypass turns one leaked account
 * into an all-tenants key. Cross-tenant platform tooling, if ever needed,
 * must be its own explicit surface — not a hole in login.
 */
export function isMemberOfTenant(
  profile: Pick<UserProfile, 'role' | 'tenant_id'>,
  tenantId: string,
): boolean {
  return !!profile.tenant_id && profile.tenant_id === tenantId;
}

export type TenantMembershipCheck = 'ok' | 'wrong_tenant';

/**
 * Verifies that the CURRENT session's profile belongs to the tenant of the
 * current subdomain. Used right after login so a cross-tenant session is
 * torn down before it ever renders a page.
 *
 * Fails open ('ok') when the subdomain, profile, or tenant config cannot be
 * resolved: those cases are already handled downstream (route guards bounce
 * a missing profile; RLS scopes all data), and failing closed here would
 * lock everyone out on a transient RPC error.
 */
export async function verifySessionBelongsToTenant(): Promise<TenantMembershipCheck> {
  const subdomain = resolveTenantSubdomain();
  if (!subdomain) return 'ok';

  const [profileRes, tenantRes] = await Promise.all([
    supabase.rpc('get_my_profile'),
    supabase.rpc('get_tenant_config_by_subdomain', { p_subdomain: subdomain }),
  ]);

  if (profileRes.error || tenantRes.error) return 'ok';

  const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
  const tenant = Array.isArray(tenantRes.data) ? tenantRes.data[0] : tenantRes.data;
  if (!profile || !tenant?.id) return 'ok';

  return isMemberOfTenant(profile, tenant.id) ? 'ok' : 'wrong_tenant';
}
