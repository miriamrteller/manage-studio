import { useMemo } from 'react';
import {
  buildNavSections,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
} from './navigationConfig';
import type { PresetModules } from '@shared/index';

export interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
  modules?: PresetModules;
}

interface UseNavItemsResult {
  sections: NavSection[];
  isAuthenticated: boolean;
}

export function useNavItems({
  userRoles,
  isAuthenticated,
  modules,
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const allItems = isAuthenticated ? navigationConfig : publicNavigationConfig;
    const items = allItems.filter(
      (item) => item.moduleKey === undefined || modules?.[item.moduleKey] !== false
    );
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated, modules]);

  return { sections, isAuthenticated };
}
