import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * PublicNavigation: Navbar for unauthenticated users
 * 
 * Shows:
 * - Logo/Tenant name (link to home)
 * - Classes link
 * - Language toggle
 * - Login button
 * 
 * WCAG: Semantic header, nav with links, proper focus states
 */
export function PublicNavigation() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = async () => {
    await setLanguage(language === 'he' ? 'en' : 'he');
  };

  return (
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
            to="/classes"
            className="text-gray-700 hover:text-primary focus-visible:outline-2 outline-primary outline-offset-2"
          >
            {t('nav.classes')}
          </Link>
          <button
            onClick={toggleLanguage}
            className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 focus-visible:outline-2 outline-primary outline-offset-2"
            aria-label={t('common.language')}
          >
            {language === 'he' && '🇬🇧 English'}
            {language === 'en' && '🇮🇱 עברית'}
          </button>
          <Link
            to="/login"
            className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2"
          >
            {t('nav.login')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
