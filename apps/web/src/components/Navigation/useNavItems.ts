import { useMemo } from 'react';
import {
  buildNavSections,
  matchesTenantFilter,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
  type NavTenantContext,
} from './navigationConfig';
import type { PresetModules } from '@shared/index';

export interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
  modules?: PresetModules;
  tenant?: NavTenantContext | null;
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
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const allItems = isAuthenticated ? navigationConfig : publicNavigationConfig;
    const items = allItems.filter(
      (item) =>
        (item.moduleKey === undefined || modules?.[item.moduleKey] !== false) &&
        matchesTenantFilter(item, tenant),
    );
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated, modules, tenant]);

  return { sections, isAuthenticated };
}
