import { useMemo } from 'react';
import {
  buildNavSections,
  matchesTenantFilter,
  matchesVertical,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
  type NavTenantContext,
} from './navigationConfig';
import type { PresetModules, FeatureKey, VerticalId } from '@shared/index';

export interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
  modules?: PresetModules;
  tenant?: NavTenantContext | null;
  /** When provided, items with a featureKey are hidden unless the feature is enabled. */
  hasFeature?: (key: FeatureKey) => boolean;
  /** Tenant vertical (tenants.skin); hides class-only pages for appointment verticals. */
  vertical?: VerticalId | null;
  /**
   * False when there is no studio (app.opalswift.com): signed-in users then see only
   * platform items, since studio pages have nothing to show. Defaults to true.
   */
  hasStudio?: boolean;
}

interface UseNavItemsResult {
  sections: NavSection[];
  isAuthenticated: boolean;
}

export function useNavItems({
  userRoles,
  isAuthenticated,
  modules,
  tenant,
  hasFeature,
  vertical,
  hasStudio = true,
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const allItems = isAuthenticated ? navigationConfig : publicNavigationConfig;
    const items = allItems.filter(
      (item) =>
        (item.moduleKey === undefined || modules?.[item.moduleKey] !== false) &&
        (item.featureKey === undefined || hasFeature === undefined || hasFeature(item.featureKey)) &&
        matchesTenantFilter(item, tenant) &&
        matchesVertical(item, vertical) &&
        (hasStudio
          ? !item.withoutStudioOnly
          : isAuthenticated
            ? item.sectionKey === 'platform'
            : !!item.worksWithoutStudio),
    );
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated, modules, tenant, hasFeature, vertical, hasStudio]);

  return { sections, isAuthenticated };
}
