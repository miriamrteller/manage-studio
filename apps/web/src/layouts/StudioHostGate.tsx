import type { ReactNode } from 'react';
import { useTenantQuery } from '@/hooks/useTenant';
import StudioNotFoundPage from '@/pages/StudioNotFoundPage';

/**
 * A studio host (subdomain or custom domain) with no studio shows "Studio not found"
 * instead of an empty studio. Only once the lookup has finished, so it never flashes
 * while loading. Reserved hosts (app., www., the apex) never look a studio up, so
 * they are unaffected.
 */
export function StudioHostGate({ children }: { children: ReactNode }) {
  const { notFound } = useTenantQuery();
  if (notFound) return <StudioNotFoundPage host={window.location.hostname} />;
  return <>{children}</>;
}
