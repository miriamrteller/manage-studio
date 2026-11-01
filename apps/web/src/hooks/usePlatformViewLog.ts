import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';

const WINDOW_MS = 10 * 60 * 1000;
const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** "/admin/students/<uuid>" → "admin-students": the page, never the record. */
export function platformViewArea(pathname: string): string {
  const area = pathname
    .split('/')
    .filter((s) => s && !ID_SEGMENT.test(s))
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 63);
  return /^[a-z]/.test(area) ? area : 'home';
}

/**
 * Platform access log, 'view' side: when the OpalSwift platform owner
 * (super_admin) opens a page of a studio that is not their own, record it so
 * the studio sees it under Settings → Security → OpalSwift access. At most
 * once per studio + page per 10 minutes per browser session (the database
 * dedupes the same way). Nothing happens for anyone else.
 */
export function usePlatformViewLog(
  user: Pick<UserProfile, 'role' | 'tenant_id'> | null,
  tenantId: string | undefined,
) {
  const { pathname } = useLocation();
  const watch = !!user && !!tenantId && user.role.includes('super_admin') && user.tenant_id !== tenantId;
  const area = platformViewArea(pathname);

  useEffect(() => {
    if (!watch || !tenantId) return;
    const key = `platform-view:${tenantId}:${area}`;
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < WINDOW_MS) return;
    sessionStorage.setItem(key, String(Date.now()));
    void supabase.rpc('log_platform_view', { p_tenant_id: tenantId, p_area: area }).then(({ error }) => {
      if (error) sessionStorage.removeItem(key);
    });
  }, [watch, tenantId, area]);
}
