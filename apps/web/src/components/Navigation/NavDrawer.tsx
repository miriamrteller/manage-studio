import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { LifeBuoy, Pin, PinOff, X } from 'lucide-react';
import type { FeatureKey } from '@shared/index';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTenantQuery } from '@/hooks/useTenant';
import { useBookingEnabled } from '@/features/scheduling/useBookingEnabled';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useReportProblem } from '@/components/ReportProblem';
import { useNavDrawer } from './NavDrawerContext';
import { useNavItems } from './useNavItems';
import { NavDrawerMenu } from './NavDrawerMenu';
import { resolveActiveNavPath, type NavItem } from './navigationConfig';

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== 'Tab') return;

  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE)
  ).filter((el) => !el.hasAttribute('disabled'));

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function NavDrawer() {
  const { t } = useTranslation();
  const { canReport, openReportProblem } = useReportProblem();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useCurrentUser();
  const { labels, classLabels, modules, vertical, profile } = useEntityLabels();
  const { tenant, isLoading: tenantLoading } = useTenantQuery();
  const { hasFeature } = useFeatureGate();
  // Resolve feature flags from the authenticated gate OR the anon-safe tenant config
  // (enabled_features), so client-facing items like booking show for guests too.
  const hasFeatureResolved = useCallback(
    (key: FeatureKey) => hasFeature(key) || (tenant?.enabled_features?.includes(key) ?? false),
    [hasFeature, tenant],
  );
  const {
    isOpen,
    isPinned,
    isOverlay,
    close,
    togglePin,
    closeOnNavigate,
    menuButtonRef,
  } = useNavDrawer();

  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  function navLabel(item: NavItem): string {
    switch (item.path) {
      case '/classes':
        return classLabels.plural;
      case '/admin/jobs':
        return labels.engagement.plural;
      case '/admin/students':
        // A studio that does not teach classes has Clients, not Students.
        return !profile.teachesClasses || vertical === 'photographer' || vertical === 'beautician'
          ? labels.contact.plural
          : t(item.labelKey);
      case '/admin/packages':
        return !profile.teachesClasses || vertical === 'photographer' ? labels.offering.plural : t(item.labelKey);
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
  }

  const navItems = sections.flatMap((section) => section.items);
  const activePath = resolveActiveNavPath(location.pathname, navItems);

  const handleNavigate = (path: string) => {
    navigate(path);
    closeOnNavigate();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    close();
    navigate('/login', { replace: true });
  };

  // Overlay: focus trap + Escape + initial focus
  useEffect(() => {
    if (!isOverlay || !panelRef.current) return;

    const panel = panelRef.current;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        menuButtonRef.current?.focus();
        return;
      }
      trapFocus(panel, event);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlay, close, menuButtonRef]);

  if (!isOpen && !isPinned) {
    return null;
  }

  const panel = (
    <aside
      ref={panelRef}
      id="nav-drawer"
      role={isOverlay ? 'dialog' : 'navigation'}
      aria-modal={isOverlay ? true : undefined}
      aria-label={t('nav.menu')}
      className={cn(
        tenant?.chrome_style === 'solid' ? 'nav-drawer-solid' : 'nav-drawer-soft',
        'nav-drawer-panel flex flex-col text-[var(--nav-text)] border-e border-[var(--nav-border)]',
        'w-[var(--nav-drawer-width)]',
        isPinned
          ? 'h-dvh max-h-dvh shrink-0 sticky top-0 overflow-hidden'
          : cn(
              'fixed inset-y-0 start-0 z-50 h-full shadow-xl transition-transform duration-200 ease-in-out',
              isOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
            )
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--nav-border)] shrink-0">
        <h2 className="font-semibold text-base">{t('nav.menu')}</h2>
        <div className="flex items-center gap-1">
          {/* Pin: desktop only */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={togglePin}
            aria-label={isPinned ? t('nav.unpin_menu') : t('nav.pin_menu')}
            aria-pressed={isPinned}
            className="hidden md:inline-flex text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]"
          >
            {isPinned ? <PinOff size={18} aria-hidden /> : <Pin size={18} aria-hidden />}
          </Button>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={close}
            aria-label={t('nav.close_menu')}
            className="text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]"
          >
            <X size={18} aria-hidden />
          </Button>
        </div>
      </div>

      <NavDrawerMenu
        sections={sections}
        activePath={activePath}
        onNavigate={handleNavigate}
        navLabel={navLabel}
        isItemDisabled={isItemDisabled}
      />

      {/* Account footer (authenticated) */}
      {isAuthenticated && user && (
        <div className="shrink-0 border-t border-[var(--nav-border)] px-4 py-3 space-y-2">
          <p className="text-sm opacity-90 truncate" title={user.email}>
            {user.email}
          </p>
          {canReport && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                close();
                openReportProblem();
              }}
              className="w-full justify-start gap-2 text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]"
            >
              <LifeBuoy size={16} aria-hidden />
              {t('report_problem.menu_item')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            aria-label={t('nav.logout')}
            className="w-full"
          >
            {t('nav.logout')}
          </Button>
        </div>
      )}
    </aside>
  );

  if (isPinned) {
    return panel;
  }

  return (
    <>
      {isOverlay && (
        <button
          type="button"
          aria-label={t('nav.close_menu')}
          className="fixed inset-0 z-40 bg-[var(--color-surface-overlay)] cursor-default"
          onClick={close}
          tabIndex={-1}
        />
      )}
      {panel}
    </>
  );
}
