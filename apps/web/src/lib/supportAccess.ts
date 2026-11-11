import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Support access: the OpalSwift platform owner (super_admin) chose, on the
 * confirm page, to enter one studio's admin. Remembered for this browser tab
 * only (sessionStorage), per studio, and gone when the tab closes or they
 * leave. It only changes what the app shows: the database already lets the
 * platform owner in (is_super_admin) and records every page opened and every
 * change in the studio's OpalSwift access log (platform_access_log).
 */
const KEY_PREFIX = 'support-access:';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(tenantId: string | undefined | null): boolean {
  if (!tenantId) return false;
  try {
    return sessionStorage.getItem(KEY_PREFIX + tenantId) === '1';
  } catch {
    return false;
  }
}

export function hasSupportAccess(tenantId: string | undefined | null): boolean {
  return read(tenantId);
}

/** Enter a studio's admin as support; the entry itself is logged for the studio. */
export function enterSupportAccess(tenantId: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + tenantId, '1');
  } catch {
    // Storage unavailable: access then lasts until the page reloads.
  }
  void supabase.rpc('log_platform_view', { p_tenant_id: tenantId, p_area: 'support-entry' });
  emit();
}

export function leaveSupportAccess(tenantId: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + tenantId);
  } catch {
    // nothing to remove
  }
  emit();
}

export function useSupportAccess(tenantId: string | undefined | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(tenantId),
    () => false,
  );
}

/** Roles the menu uses: support access shows the platform owner the studio admin's menu. */
export function rolesWithSupportAccess(roles: string[] | null, supportAccess: boolean): string[] | null {
  if (!roles || !supportAccess || !roles.includes('super_admin') || roles.includes('tenant_admin')) return roles;
  return [...roles, 'tenant_admin'];
}
