import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useReportProblem } from '@/components/ReportProblem';
import { useNavDrawer } from './NavDrawerContext';
import { useVisibleNav } from './useVisibleNav';
import { NavDrawerMenu } from './NavDrawerMenu';
import { resolveActiveNavPath } from './navigationConfig';

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
  const { sections, isAuthenticated, entryLabel, isItemDisabled, vertical, user, tenant } =
    useVisibleNav();
  const {
    isOpen,
    isPinned,
    isOverlay,
    isIconsOnly,
    close,
    toggleIconsOnly,
    closeOnNavigate,
    menuButtonRef,
  } = useNavDrawer();

  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
        isIconsOnly ? 'w-16' : 'w-[var(--nav-drawer-width)]',
        isPinned
          ? 'h-dvh max-h-dvh shrink-0 sticky top-0 overflow-hidden'
          : cn(
              'fixed inset-y-0 start-0 z-50 h-full shadow-xl transition-transform duration-200 ease-in-out',
              isOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
            )
      )}
    >
      {/* Header: the full size / icons only switch (wide screens), or Close (phone menu). */}
      <div
        className={cn(
          'flex items-center gap-2 py-3 border-b border-[var(--nav-border)] shrink-0',
          isIconsOnly ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {!isIconsOnly && <h2 className="font-semibold text-base">{t('nav.menu')}</h2>}
        <div className="flex items-center gap-1">
          {isPinned && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleIconsOnly}
              aria-label={isIconsOnly ? t('nav.full_menu') : t('nav.icons_only_menu')}
              title={isIconsOnly ? t('nav.full_menu') : t('nav.icons_only_menu')}
              aria-pressed={isIconsOnly}
              className="text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]"
            >
              {/* Mirrored in Hebrew, where the menu sits on the right. */}
              {isIconsOnly ? (
                <PanelLeftOpen size={18} aria-hidden className="rtl:-scale-x-100" />
              ) : (
                <PanelLeftClose size={18} aria-hidden className="rtl:-scale-x-100" />
              )}
            </Button>
          )}
          {isOverlay && (
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
          )}
        </div>
      </div>

      <NavDrawerMenu
        sections={sections}
        activePath={activePath}
        onNavigate={handleNavigate}
        entryLabel={entryLabel}
        isItemDisabled={isItemDisabled}
        iconsOnly={isIconsOnly}
        vertical={vertical}
      />

      {/* Account footer (authenticated) */}
      {isAuthenticated && user && (
        <div className={cn('shrink-0 border-t border-[var(--nav-border)] py-3 space-y-2', isIconsOnly ? 'px-2' : 'px-4')}>
          {!isIconsOnly && (
            <p className="text-sm opacity-90 truncate" title={user.email}>
              {user.email}
            </p>
          )}
          {canReport && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                close();
                openReportProblem();
              }}
              aria-label={isIconsOnly ? t('report_problem.menu_item') : undefined}
              title={isIconsOnly ? t('report_problem.menu_item') : undefined}
              className={cn(
                'w-full gap-2 text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]',
                isIconsOnly ? 'justify-center px-0' : 'justify-start',
              )}
            >
              <MessageSquare size={16} aria-hidden />
              {!isIconsOnly && t('report_problem.menu_item')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            aria-label={t('nav.logout')}
            title={isIconsOnly ? t('nav.logout') : undefined}
            className={cn('w-full', isIconsOnly && 'px-0')}
          >
            {isIconsOnly ? <LogOut size={16} aria-hidden className="rtl:-scale-x-100" /> : t('nav.logout')}
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
