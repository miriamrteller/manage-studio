import { ReactNode } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { ProtectedNavigation } from '../components/Navigation/ProtectedNavigation';
import { PublicNavigation } from '../components/Navigation/PublicNavigation';

/**
 * SmartLayout: Single layout that adapts to authentication status
 * 
 * Features:
 * - Detects auth status via useCurrentUser()
 * - Shows ProtectedNavigation (role-based menu) if authenticated
 * - Shows PublicNavigation (login/language) if not authenticated
 * - Seamless UX: navbar switches without redirect
 * - Industry standard: Netflix, GitHub, etc.
 * 
 * Used for: Routes that serve both authenticated and unauthenticated users
 * - / (home/classes)
 * - /classes
 * 
 * WCAG: Semantic header, nav, main, footer; role="banner" on header
 */
export function SmartLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Smart Navigation: Adapts based on auth status */}
      {isLoading ? (
        // Loading state: show nothing (or minimal placeholder)
        null
      ) : user ? (
        // Authenticated: Show protected navigation with role-based menu
        <ProtectedNavigation />
      ) : (
        // Not authenticated: Show public navigation with login button
        <PublicNavigation />
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              {/* h2: footer is a page-level section, not subordinate to any h3 */}
              <h2 className="font-bold mb-2">Creative Ballet Academy</h2>
              <p className="text-sm text-gray-600">School Management</p>
            </div>
            <div className="text-sm text-gray-600">
              © {new Date().getFullYear()} Creative Ballet Academy. All rights
              reserved
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
