import { ReactNode } from "react";
import { useTranslation } from 'react-i18next';
import { useTenant } from '../hooks/useTenant';
import { PublicNavigation } from '../components/Navigation/PublicNavigation';

/**
 * PublicLayout: Header + Footer for pages that require unauthenticated state
 * - Login, Signup pages must show login navbar (not protected navbar)
 * - Uses PublicNavigation component for consistent navbar
 * WCAG: Semantic header, nav with links, footer
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tenant = useTenant();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <PublicNavigation />

      {/* Main Content */}
      <main className="flex-1" role="main">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              {/* h2: footer is a page-level section, not subordinate to any h3 */}
              {tenant?.name && (
                <h2 className="font-bold mb-2">{tenant?.name}</h2>
              )}
              <p className="text-sm text-gray-600">
                {t("footer.school_management")}
              </p>
            </div>
            <div className="text-sm text-gray-600">
              © {new Date().getFullYear()} {tenant?.name}.{" "}
              {t("footer.all_rights")}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
