import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTenant } from '../../hooks/useTenant';
import { supabase } from '../../lib/supabase';
import { navigationConfig, canAccessRoute } from './navigationConfig';
import { DropdownMenu } from './DropdownMenu';

/**
 * ProtectedNavigation: Navigation bar for authenticated users
 * - Shows role-based links based on navigationConfig
 * - Includes user email and logout button
 * - Accessible with proper ARIA attributes
 * - Responsive layout
 * 
 * All routes are configured in navigationConfig.ts with their required roles.
 * Routes without matching user roles are hidden completely from the DOM.
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

  return (
    <header
      className="border-b border-primary-active bg-primary text-on-primary sticky top-0 z-50"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Top row: Logo and User Info */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo / Tenant Name */}
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-on-primary font-bold text-lg hover:bg-primary-hover hover:text-on-primary focus-visible:outline-2 outline-on-primary outline-offset-2"
            aria-label={t('common.home')}
          >
            {tenant?.name || 'Ballet School'}
          </Button>

          {/* User Menu: Email + Logout */}
          <div className="flex gap-3 items-center">
            {user && (
              <>
                <span className="text-sm text-on-primary opacity-90">{user.email}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLogout}
                  aria-label={t('nav.logout')}
                >
                  {t('nav.logout')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Links: Role-based, config-driven */}
        <nav className="flex gap-6 flex-wrap items-center">
          {navigationConfig.map((navItem) => {
            // Check if user can access this route
            const isVisible = user ? canAccessRoute(user.role, navItem.requiredRoles) : false;

            if (!isVisible) {
              return null;
            }

            // If this is a dropdown item, use DropdownMenu component
            if (navItem.dropdownItems && navItem.dropdownItems.length > 0) {
              return (
                <DropdownMenu
                  key={navItem.path}
                  item={navItem}
                  isVisible={isVisible}
                />
              );
            }

            // Regular link
            return (
              <Button
                key={navItem.path}
                variant="ghost"
                onClick={() => navigate(navItem.path)}
                className="text-on-primary hover:bg-primary-hover hover:text-on-primary focus-visible:outline-2 outline-on-primary outline-offset-2 transition-colors"
                aria-label={t(navItem.labelKey)}
              >
                {t(navItem.labelKey)}
              </Button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
