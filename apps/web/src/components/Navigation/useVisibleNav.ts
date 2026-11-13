import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useTenantQuery } from '@/hooks/useTenant';
import { useBookingEnabled } from '@/features/scheduling/useBookingEnabled';
import { useNavItems } from './useNavItems';
import type { NavEntry, NavItem } from './navigationConfig';

/**
 * The menu the signed-in person sees, with the studio's own words. Shared by the sidebar and
 * the tabs along the top of each area, so both always show the same pages.
 */
export function useVisibleNav() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { labels, classLabels, modules, vertical, profile } = useEntityLabels();
  const { tenant, isLoading: tenantLoading } = useTenantQuery();
  // The same check the pages use (useHasFeature), so a tab never opens on a dead end.
  const { hasFeature: hasFeatureResolved } = useHasFeature();

  const { sections, isAuthenticated } = useNavItems({
    userRoles: user?.role ?? null,
    isAuthenticated: Boolean(user),
    modules,
    tenant,
    hasFeature: hasFeatureResolved,
    profile,
    // No studio once the lookup is done (app.opalswift.com, or a user without one).
    hasStudio: Boolean(tenant) || tenantLoading,
  });

  // Grey out booking-dependent items (e.g. /book) only when we positively know
  // the tenant has booking turned off; undefined (guest/loading) leaves them on.
  const bookingEnabled = useBookingEnabled();
  const isItemDisabled = useCallback(
    (item: NavItem) => item.disableWhenBookingOff === true && bookingEnabled === false,
    [bookingEnabled],
  );

  const contactsWord =
    !profile.teachesClasses || vertical === 'photographer' || vertical === 'beautician';

  /** A page's name (menu line or tab). */
  const navLabel = useCallback(
    (item: NavItem): string => {
      switch (item.path) {
        case '/classes':
          return classLabels.plural;
        case '/admin/jobs':
          return labels.engagement.plural;
        case '/admin/students':
          // A studio that does not teach classes has Clients, not Students.
          return contactsWord ? labels.contact.plural : t(item.labelKey);
        case '/admin/packages':
          return !profile.teachesClasses || vertical === 'photographer'
            ? labels.offering.plural
            : t(item.labelKey);
        case '/admin/setup/waivers':
          return vertical === 'photographer' ? t('nav.contracts') : t(item.labelKey);
        case '/admin/families':
          return labels.account.plural;
        case '/admin/setup/levels':
          return labels.category.plural;
        case '/admin/setup/terms':
          return labels.season.plural;
        case '/admin/classes':
          // Always class wording (Hebrew: "שיעורים"), never a skin's word such as "Packages".
          return classLabels.plural;
        default:
          return t(item.labelKey);
      }
    },
    [t, labels, classLabels, profile.teachesClasses, vertical, contactsWord],
  );

  /** A menu line's name: the area's name, or the page's own name for a line of its own. */
  const entryLabel = useCallback(
    (entry: NavEntry): string => {
      const first = entry.items[0];
      switch (entry.area) {
        case undefined:
          return navLabel(first);
        case 'home':
          return t('nav.home');
        case 'leads':
          return t('nav.leads');
        case 'people':
          return contactsWord ? labels.contact.plural : t('nav.students');
        case 'classes':
          return classLabels.plural;
        case 'projects':
          return labels.engagement.plural;
        case 'bookings':
          return t('nav.area.bookings');
        case 'shop':
          return entry.items.length === 1 && first.path === '/admin/photo-shop'
            ? navLabel(first)
            : t('nav.shop');
        case 'finance':
          return t('nav.finance');
        case 'settings':
          return t('nav.area.settings');
        default:
          return navLabel(first);
      }
    },
    [t, navLabel, labels, classLabels, contactsWord],
  );

  return { sections, isAuthenticated, navLabel, entryLabel, isItemDisabled, vertical, user, tenant };
}
