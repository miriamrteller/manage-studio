import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import { ProtectedNavigation } from '../components/Navigation/ProtectedNavigation';
import { PublicNavigation } from '../components/Navigation/PublicNavigation';

const PUBLIC_PATHS = new Set(['/', '/classes', '/login', '/signup', '/enrol']);

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth/');
}

/**
 * AppLayout: Unified layout for all pages
 * - Handles navigation (public/protected) based on authentication
 * - Handles loading and redirect logic
 * - Always provides <main> for accessibility
 * - Renders a consistent footer
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();
  const navigate = useNavigate();
  const publicRoute = isPublicRoute(location.pathname);

  // Redirect to login if user is not authenticated and route is protected
  useEffect(() => {
    if (!isLoading && !user && window.location.pathname.startsWith('/admin')) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading && !publicRoute) {
    return <div className="p-4">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      {!isLoading && user ? <ProtectedNavigation /> : <PublicNavigation />}

      {/* Main Content */}
      <main className="flex-1 px-4 md:px-8 lg:px-12 xl:px-24" role="main">{children}</main>

      {/* Footer */}
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
              &copy; {new Date().getFullYear()} {tenant?.name ?? t('footer.school_name_fallback')}.{' '}
              {t('footer.all_rights')}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
