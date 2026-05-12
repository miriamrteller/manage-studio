import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';

/**
 * PublicLayout: Header + Footer for unauthenticated pages
 * No auth guard — visitors browse freely
 * WCAG: Semantic header, nav with links, footer
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tenant = useTenant();

  // Apply document direction + language
  useEffect(() => {
    if (tenant) {
      document.documentElement.dir = tenant.dir || 'rtl';
      document.documentElement.lang = tenant.language || 'he';
    }
  }, [tenant]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="border-b border-gray-200 bg-white sticky top-0 z-50"
        role="banner"
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="text-primary font-bold text-lg hover:text-opacity-80 focus-visible:outline-2 outline-primary outline-offset-2"
          >
            {tenant?.name || 'Ballet School'}
          </Link>

          {/* Nav */}
          <nav className="flex gap-6 items-center">
            <Link
              to="/"
              className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2"
            >
              {t('nav.classes')}
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2"
            >
              {t('nav.login')}
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              {/* h2: footer is a page-level section, not subordinate to any h3 */}
              {tenant?.name && <h2 className="font-bold mb-2">{tenant?.name}</h2>}
              <p className="text-sm text-gray-600">{t('footer.school_management')}</p>
            </div>
            <div className="text-sm text-gray-600">
              © {new Date().getFullYear()} {tenant?.name}. {t('footer.all_rights')}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
