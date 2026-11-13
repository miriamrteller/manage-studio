import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PROFILE_GATES } from '@shared/index';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useTenantQuery } from '@/hooks/useTenant';
import {
  matchesProfile,
  navigationConfig,
  resolveActiveNavPath,
  type NavItem,
} from '@/components/Navigation/navigationConfig';
import type { FeatureKey } from '@shared/index';

const ADMIN_ITEMS = navigationConfig.filter((item) => item.path.startsWith('/admin/'));

/** True when this page is hidden by "How do clients work with you?" or a feature the studio has switched off. */
export function isPageSwitchedOff(
  item: NavItem,
  profile: Parameters<typeof matchesProfile>[1],
  hasFeature: (key: FeatureKey) => boolean,
): boolean {
  if (!matchesProfile(item, profile)) return true;
  // Only features the studio's ticks (or a beta switch) turn on and off. Plan-level keys such as
  // the dormant Stripe pages keep their own handling.
  if (item.featureKey && PROFILE_GATES[item.featureKey] && !hasFeature(item.featureKey)) return true;
  if (
    item.anyFeatureKeys &&
    item.anyFeatureKeys.every((key) => PROFILE_GATES[key]) &&
    !item.anyFeatureKeys.some((key) => hasFeature(key))
  ) {
    return true;
  }
  return false;
}

/**
 * A page the menu hides (for example Seasons with Classes switched off) can't be opened by typing
 * its address or following an old link either: it goes to Home (owner, 13 Nov 2026).
 */
export function HiddenPageGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { profile } = useEntityLabels();
  const { tenant, isLoading: tenantLoading } = useTenantQuery();
  const { hasFeature, isLoading: featuresLoading } = useHasFeature();

  if (tenantLoading || featuresLoading || !tenant) return <>{children}</>;

  const matched = resolveActiveNavPath(pathname, ADMIN_ITEMS);
  const item = matched ? ADMIN_ITEMS.find((entry) => entry.path === matched) : undefined;
  if (item && isPageSwitchedOff(item, profile, hasFeature)) {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}
