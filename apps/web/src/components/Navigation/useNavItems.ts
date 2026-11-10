import { useMemo } from 'react';
import {
  buildNavSections,
  matchesTenantFilter,
  matchesProfile,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
  type NavTenantContext,
} from './navigationConfig';
import type { PresetModules, FeatureKey, StudioProfile } from '@shared/index';

export interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
  modules?: PresetModules;
  tenant?: NavTenantContext | null;
  /** When provided, items with a featureKey are hidden unless the feature is enabled. */
  hasFeature?: (key: FeatureKey) => boolean;
  /** The studio's payment flow and switches; hides pages the studio does not use. */
  profile?: StudioProfile | null;
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
  profile,
  hasStudio = true,
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const allItems = isAuthenticated ? navigationConfig : publicNavigationConfig;
    const items = allItems.filter(
      (item) =>
        (item.moduleKey === undefined || modules?.[item.moduleKey] !== false) &&
        (item.featureKey === undefined || hasFeature === undefined || hasFeature(item.featureKey)) &&
        matchesTenantFilter(item, tenant) &&
        matchesProfile(item, profile) &&
        // Platform pages are for the OpalSwift HQ address only, never a studio's menu,
        // even when the platform owner also has a studio role there (as on the dev website).
        (hasStudio
          ? !item.withoutStudioOnly && item.sectionKey !== 'platform'
          : isAuthenticated
            ? item.sectionKey === 'platform'
            : !!item.worksWithoutStudio),
    );
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated, modules, tenant, hasFeature, profile, hasStudio]);

  return { sections, isAuthenticated };
}
