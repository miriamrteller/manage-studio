import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import {
  AppHeader,
  AreaTabs,
  NavDrawer,
  NavDrawerProvider,
  useNavDrawer,
} from '../components/Navigation';
import { cn } from '../lib/utils';
import { LegalFooterLinks } from '../components/LegalFooterLinks';
import { ReportProblemProvider } from '../components/ReportProblem';
import { currentStudioDisplayName } from '../lib/studioDisplayName';

const PUBLIC_PATHS = new Set(['/', '/classes', '/login', '/signup', '/enrol']);

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/enrol/pay/') ||
    pathname.startsWith('/enrol/return/') ||
    pathname.startsWith('/legal/') ||
    pathname.startsWith('/unsubscribe/')
  );
}

/**
 * Google Calendar and SmugMug always return to app.<root>, where the studio admin is not
 * signed in. Their callback pages carry on to the studio's own address (and guard
 * themselves there), so they must not be sent to login first.
 */
export function isIntegrationCallbackPath(pathname: string): boolean {
  return /^\/admin\/setup\/integrations\/[a-z-]+\/callback\/?$/.test(pathname);
}

function AppLayoutContent({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { isPinned } = useNavDrawer();
  const studioName = currentStudioDisplayName(tenant);

  return (
    <div
      className={cn(
        'flex',
        isPinned ? 'h-dvh max-h-dvh flex-row overflow-hidden' : 'min-h-screen flex-col',
      )}
    >
      <NavDrawer />

      <div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-y-auto">
        <AppHeader />

        <main
          className="flex-1 px-4 md:px-8 lg:px-12 xl:px-24 pt-6 md:pt-8 pb-6 md:pb-8"
          role="main"
        >
          <AreaTabs />
          {children}
        </main>

        <footer className={`${tenant?.chrome_style === 'solid' ? 'border-t border-secondary-active bg-secondary text-on-secondary' : 'app-footer-soft'} mt-16`}>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                {studioName && <h2 dir="auto" className="font-bold mb-2">{studioName}</h2>}
              </div>
              <div className="space-y-3 text-sm opacity-80">
                <LegalFooterLinks />
                <p>
                  &copy; {new Date().getFullYear()}{' '}
                  {studioName && <><bdi>{studioName}</bdi>. </>}
                  {t('footer.all_rights')}
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * AppLayout: Unified layout for all pages
 * - Compact header + hamburger nav drawer (overlay or pinned)
 * - Handles loading and redirect logic
 * - Always provides <main> for accessibility
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();
  const navigate = useNavigate();
  const publicRoute = isPublicRoute(location.pathname);

  useEffect(() => {
    const path = window.location.pathname;
    if (!isLoading && !user && path.startsWith('/admin') && !isIntegrationCallbackPath(path)) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading && !publicRoute) {
    return <div className="p-4">{t('common.loading')}</div>;
  }

  return (
    <ReportProblemProvider>
      <NavDrawerProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </NavDrawerProvider>
    </ReportProblemProvider>
  );
}
