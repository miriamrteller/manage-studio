import { useMemo } from 'react';
import {
  buildNavSections,
  matchesTenantFilter,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
  type NavTenantContext,
} from './navigationConfig';
import type { PresetModules, FeatureKey } from '@shared/index';

export interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
  modules?: PresetModules;
  tenant?: NavTenantContext | null;
  /** When provided, items with a featureKey are hidden unless the feature is enabled. */
  hasFeature?: (key: FeatureKey) => boolean;
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
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const allItems = isAuthenticated ? navigationConfig : publicNavigationConfig;
    const items = allItems.filter(
      (item) =>
        (item.moduleKey === undefined || modules?.[item.moduleKey] !== false) &&
        (item.featureKey === undefined || hasFeature === undefined || hasFeature(item.featureKey)) &&
        matchesTenantFilter(item, tenant),
    );
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated, modules, tenant, hasFeature]);

  return { sections, isAuthenticated };
}
