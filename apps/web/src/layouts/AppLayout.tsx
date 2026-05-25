import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import {
  AppHeader,
  NavDrawer,
  NavDrawerProvider,
  useNavDrawer,
} from '../components/Navigation';
import { cn } from '../lib/utils';

const PUBLIC_PATHS = new Set(['/', '/classes', '/login', '/signup', '/enrol']);

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth/');
}

function AppLayoutContent({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { isPinned } = useNavDrawer();

  return (
    <div className={cn('min-h-screen flex', isPinned ? 'flex-row' : 'flex-col')}>
      <NavDrawer />

      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader />

        <main className="flex-1 px-4 md:px-8 lg:px-12 xl:px-24" role="main">
          {children}
        </main>

        <footer className="border-t border-secondary-active bg-secondary text-on-secondary mt-16">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h2 className="font-bold mb-2">
                  {tenant?.name ?? t('footer.school_name_fallback')}
                </h2>
                <p className="text-sm opacity-80">{t('footer.school_management')}</p>
              </div>
              <div className="text-sm opacity-80">
                &copy; {new Date().getFullYear()}{' '}
                {tenant?.name ?? t('footer.school_name_fallback')}. {t('footer.all_rights')}
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
    if (!isLoading && !user && window.location.pathname.startsWith('/admin')) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading && !publicRoute) {
    return <div className="p-4">{t('common.loading')}</div>;
  }

  return (
    <NavDrawerProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </NavDrawerProvider>
  );
}
