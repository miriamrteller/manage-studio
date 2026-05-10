import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTenant } from '../../hooks/useTenant';
import { supabase } from '../../lib/supabase';

/**
 * ProtectedNavigation: Navigation bar for authenticated users
 * - Shows role-based links (Admin, Parent, etc.)
 * - Includes user email and logout button
 * - Accessible with proper ARIA attributes
 * - Responsive layout
 * 
 * Role-based navigation:
 * - tenant_admin: People, Families, Setup
 * - parent/guardian: Portal
 * - All: Logo/Home, Logout, Language switcher
 */
export function ProtectedNavigation() {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  // Loading state
  if (isLoading) {
    return null; // ProtectedLayout will show loading state
  }

  // Determine if user has specific roles
  const isAdmin = user?.role.includes('tenant_admin');
  const isParent = user?.role.some((r) => ['parent', 'guardian'].includes(r));

  return (
    <header
      className="border-b border-gray-200 bg-white sticky top-0 z-50"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Top row: Logo and User Info */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo / Tenant Name */}
          <button
            onClick={() => navigate('/')}
            className="text-primary font-bold text-lg hover:opacity-80 focus-visible:outline-2 outline-primary outline-offset-2"
            aria-label={t('common.home')}
          >
            {tenant?.name || 'Ballet School'}
          </button>

          {/* User Menu: Email + Logout */}
          <div className="flex gap-3 items-center">
            {user && (
              <>
                <span className="text-sm text-gray-700">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
                  aria-label={t('nav.logout')}
                >
                  {t('nav.logout')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Links: Role-based */}
        <nav className="flex gap-6 flex-wrap items-center">
          {/* Classes link - visible to all authenticated users */}
          <button
            onClick={() => navigate('/classes')}
            className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
            aria-label={t('nav.classes')}
          >
            {t('nav.classes')}
          </button>

          {/* Admin-only links */}
          {isAdmin && (
            <>
              <button
                onClick={() => navigate('/admin/people')}
                className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
              >
                {t('pages.admin.people.title')}
              </button>
              <button
                onClick={() => navigate('/admin/families')}
                className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
              >
                {t('pages.admin.families.title')}
              </button>
              <button
                onClick={() => navigate('/admin/setup')}
                className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
              >
                {t('pages.admin.setup.title')}
              </button>
            </>
          )}

          {/* Parent-only links */}
          {isParent && (
            <button
              onClick={() => navigate('/portal')}
              className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2 transition-colors"
            >
              {t('nav.portal')}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
