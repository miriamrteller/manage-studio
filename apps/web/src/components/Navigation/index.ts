export { AppHeader } from './AppHeader';
export { NavDrawer } from './NavDrawer';
export { NavDrawerProvider, useNavDrawer } from './NavDrawerContext';
export { useNavItems } from './useNavItems';
export {
  navigationConfig,
  publicNavigationConfig,
  canAccessRoute,
  buildNavSections,
  matchesTenantFilter,
  resolveActiveNavPath,
  tenantUsesGrow,
  tenantUsesIcount,
  tenantUsesSplitProviders,
} from './navigationConfig';
export type { NavItem, NavSection, NavSectionKey, NavTenantFilter } from './navigationConfig';
export {
  tenantUsesBundledProvider,
  isHostedPageCheckoutReady,
  isMockHostedPaymentPage,
} from '@/lib/tenantProviderRouting';
