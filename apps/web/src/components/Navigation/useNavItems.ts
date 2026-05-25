import { useMemo } from 'react';
import {
  buildNavSections,
  navigationConfig,
  publicNavigationConfig,
  type NavSection,
} from './navigationConfig';

interface UseNavItemsOptions {
  userRoles: string[] | null;
  isAuthenticated: boolean;
}

interface UseNavItemsResult {
  sections: NavSection[];
  isAuthenticated: boolean;
}

export function useNavItems({
  userRoles,
  isAuthenticated,
}: UseNavItemsOptions): UseNavItemsResult {
  const sections = useMemo(() => {
    const items = isAuthenticated ? navigationConfig : publicNavigationConfig;
    return buildNavSections(items, isAuthenticated ? userRoles : []);
  }, [userRoles, isAuthenticated]);

  return { sections, isAuthenticated };
}
