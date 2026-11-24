import { useCallback } from 'react';
import type { FeatureKey } from '@shared/index';
import { useFeatureGate } from './useFeatureGate';
import { useTenantQuery } from './useTenant';

/**
 * The one feature check for menus, tabs and pages, so a tab the menu shows never opens on a
 * "not available on your plan" page (owner, 13 Nov 2026). A feature counts as on when the
 * signed-in gate or the studio's own feature list (tenant config, readable by guests too) has it.
 * `isLoading` stays true until both have loaded, so a page never flashes a dead end.
 */
export function useHasFeature(): {
  hasFeature: (key: FeatureKey) => boolean;
  hasAnyFeature: (keys: readonly FeatureKey[]) => boolean;
  isLoading: boolean;
} {
  const { hasFeature: gateHas, isLoading: gateLoading } = useFeatureGate();
  const { tenant, isLoading: tenantLoading } = useTenantQuery();

  const hasFeature = useCallback(
    (key: FeatureKey) => gateHas(key) || (tenant?.enabled_features?.includes(key) ?? false),
    [gateHas, tenant],
  );
  const hasAnyFeature = useCallback(
    (keys: readonly FeatureKey[]) => keys.some((key) => hasFeature(key)),
    [hasFeature],
  );

  return { hasFeature, hasAnyFeature, isLoading: gateLoading || tenantLoading };
}
