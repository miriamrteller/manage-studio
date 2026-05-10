import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import { supabase } from '../lib/supabase';

/**
 * ProtectedLayout: Header + Footer for authenticated pages
 * Includes auth guard: redirects to login if no session
 * Shows user menu with logout button
 * WCAG: Semantic header, nav, user menu with focus management
 */
export function ProtectedLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  // If not loading but no user, redirect happens in route guard
  // This is a safety check
  if (!isLoading && !user) {
    navigate('/login', { replace: true });
    return null;
  }

  if (isLoading) {
    return <div className="p-4">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="border-b border-gray-200 bg-white sticky top-0 z-50"
        role="banner"
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-primary font-bold text-lg">
            {tenant?.name || 'Ballet School'}
          </h1>

          {/* User Menu */}
          <div className="flex gap-4 items-center">
            {user && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-700">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus-visible:outline-2 outline-primary outline-offset-2"
                  aria-label={t('nav.logout')}
                >
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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
