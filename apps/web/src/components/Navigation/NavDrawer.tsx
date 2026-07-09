import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pin, PinOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
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
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useCurrentUser();
  const { labels, modules } = useEntityLabels();
  const tenant = useTenant();
  const { hasFeature } = useFeatureGate();
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
    hasFeature,
  });

  function navLabel(item: NavItem): string {
    switch (item.path) {
      case '/classes':
        return labels.offering.plural;
      case '/admin/families':
        return labels.account.plural;
      case '/admin/setup/levels':
        return labels.category.plural;
      case '/admin/setup/terms':
        return labels.season.plural;
      case '/admin/setup/classes':
        return `${t('nav.manage')} ${labels.offering.plural}`;
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
        'nav-drawer-panel flex flex-col bg-primary text-on-primary border-e border-primary-active',
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
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-primary-active shrink-0">
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
            className="hidden md:inline-flex text-on-primary hover:bg-primary-hover hover:text-on-primary"
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
            className="text-on-primary hover:bg-primary-hover hover:text-on-primary"
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
      />

      {/* Account footer (authenticated) */}
      {isAuthenticated && user && (
        <div className="shrink-0 border-t border-primary-active px-4 py-3 space-y-2">
          <p className="text-sm opacity-90 truncate" title={user.email}>
            {user.email}
          </p>
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
