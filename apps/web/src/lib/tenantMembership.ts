import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import type { UserProfile } from '@/types/auth';

/**
 * Tenant membership: a signed-in user may only act on the tenant their
 * profile belongs to — the profile's tenant_id must equal the tenant
 * resolved from the subdomain.
 *
 * The ONE exception is `super_admin`, the platform-owner role: it works on
 * every subdomain (matching the `is_super_admin()` bypass policies in RLS).
 * That role must belong to exactly one deliberate platform account
 * (miriamrteller in dev) and must NEVER be granted to per-tenant admins or
 * demo accounts — any account that holds it is an all-tenants key.
 */
export function isMemberOfTenant(
  profile: Pick<UserProfile, 'role' | 'tenant_id'>,
  tenantId: string,
): boolean {
  if (profile.role.includes('super_admin')) return true;
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
