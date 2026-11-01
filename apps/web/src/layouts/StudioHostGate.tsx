import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenantQuery } from '@/hooks/useTenant';
import { isPlatformAppHost } from '@/lib/resolveTenantSubdomain';
import StudioNotFoundPage from '@/pages/StudioNotFoundPage';
import PlatformWelcomePage from '@/features/platform-shell/PlatformWelcomePage';

/**
 * Picks what a host shows before any studio page:
 * - a studio host (subdomain or custom domain) with no studio → "Studio not found", only
 *   once the lookup has finished, so it never flashes while loading;
 * - app.opalswift.com (app.<root>) → OpalSwift's welcome page, at the root path only,
 *   so login, onboarding and the handoff routes work as before.
 */
export function StudioHostGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { notFound } = useTenantQuery();
  if (notFound) return <StudioNotFoundPage host={window.location.hostname} />;
  if (isPlatformAppHost() && pathname === '/') return <PlatformWelcomePage />;
  return <>{children}</>;
}
