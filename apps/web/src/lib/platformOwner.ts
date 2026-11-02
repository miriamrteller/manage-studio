/**
 * The OpalSwift platform owner: the one account reserved for super_admin
 * (supabase/migrations/20260827000100_super_admin_lockdown.sql) and the only
 * account that may exist without a studio (…_platform_owner_without_studio.sql).
 * Changing owners is a migration, not an edit here alone.
 */
export const PLATFORM_OWNER_EMAIL = 'miriamrteller@gmail.com';

export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}
