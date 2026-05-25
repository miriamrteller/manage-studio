import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = async () => {
    await setLanguage(language === 'he' ? 'en' : 'he');
  };

  return (
    <header
      className="border-b border-primary-active bg-primary text-on-primary sticky top-0 z-50"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link
          to="/"
          className="text-on-primary font-bold text-lg hover:opacity-90 focus-visible:outline-2 outline-on-primary outline-offset-2"
        >
          {tenant?.name || 'Ballet School'}
        </Link>

        {/* Nav */}
        <nav className="flex gap-6 items-center">
          <Link
            to="/classes"
            className="text-on-primary hover:opacity-90 focus-visible:outline-2 outline-on-primary outline-offset-2"
          >
            {t('nav.classes')}
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            aria-label={t('common.language')}
            className="border-on-primary text-on-primary bg-transparent hover:bg-primary-hover hover:text-on-primary"
          >
            {language === 'he' && '🇬🇧 English'}
            {language === 'en' && '🇮🇱 עברית'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/login')}
            aria-label={t('nav.login')}
          >
            {t('nav.login')}
          </Button>
        </nav>
      </div>
    </header>
  );
}
