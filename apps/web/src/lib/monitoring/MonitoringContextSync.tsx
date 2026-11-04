import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { isMonitoringEnabled, setMonitoringContext, setMonitoringRoute } from './index';
import { scrubPath } from './scrub';

const ROLE_PRIORITY = ['super_admin', 'tenant_admin', 'teacher', 'parent', 'student'];

export function primaryRole(roles: string[] | undefined): string | null {
  if (!roles?.length) return null;
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0];
}

function Sync() {
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const { pathname } = useLocation();

  useEffect(() => {
    setMonitoringContext({ tenantId: tenant?.id, tenantSubdomain: tenant?.subdomain, userId: user?.id, role: primaryRole(user?.role) });
  }, [tenant?.id, tenant?.subdomain, user?.id, user?.role]);

  useEffect(() => {
    setMonitoringRoute(scrubPath(pathname));
  }, [pathname]);

  return null;
}

/** Keeps error-report tags (tenant, user id, role, route) in step with the app. Renders nothing. */
export function MonitoringContextSync() {
  return isMonitoringEnabled() ? <Sync /> : null;
}
