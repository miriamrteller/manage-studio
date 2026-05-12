import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import { ProtectedNavigation } from '../components/Navigation/ProtectedNavigation';

/**
 * ProtectedLayout: Header + Footer for authenticated pages
 * - Includes ProtectedNavigation with role-based links
 * - Auth guard: redirects to login if no session
 * - Shows user menu with logout button
 * - WCAG: Semantic header, nav, user menu with focus management
 */
export function ProtectedLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();
  const navigate = useNavigate();

  // Apply document direction + language
  useEffect(() => {
    if (tenant?.dir) document.documentElement.dir = tenant.dir;
    if (tenant?.language) document.documentElement.lang = tenant.language;
  }, [tenant]);

  // Redirect to login if user is not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <div className="p-4">{t('common.loading')}</div>;
  }

  // If not authenticated, don't render content (will redirect in useEffect above)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Protected Navigation with role-based links */}
      <ProtectedNavigation />

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-sm text-gray-600">
          © {new Date().getFullYear()} {tenant?.name}
        </div>
      </footer>
    </div>
  );
}
