import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenantQuery } from '@/hooks/useTenant';
import { isPlatformAppHost } from '@/lib/resolveTenantSubdomain';
import StudioNotFoundPage from '@/pages/StudioNotFoundPage';
import PlatformWelcomePage from '@/features/platform-shell/PlatformWelcomePage';
import { PlatformSignupRedirect, PlatformStudioOnlyNotice } from '@/features/platform-shell/PlatformStudioOnlyPages';
import { isStudioOnlyPath } from '@/lib/platformSignup';

/**
 * Picks what a host shows before any studio page:
 * - a studio host (subdomain or custom domain) with no studio → "Studio not found", only
 *   once the lookup has finished, so it never flashes while loading;
 * - app.opalswift.com (app.<root>) → OpalSwift's welcome page, at the root path only,
 *   so login, onboarding and the handoff routes work as before;
 * - on app.<root>, /signup goes to OpalSwift's signup and a studio-only page
 *   (classes, booking, enrolment, forms) explains it lives on a studio's address,
 *   instead of waiting for a studio that never loads.
 */
export function StudioHostGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { notFound } = useTenantQuery();
  if (notFound) return <StudioNotFoundPage host={window.location.hostname} />;
  if (isPlatformAppHost()) {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return <PlatformWelcomePage />;
    if (path === '/signup') return <PlatformSignupRedirect />;
    if (isStudioOnlyPath(path)) return <PlatformStudioOnlyNotice />;
  }
  return <>{children}</>;
}
