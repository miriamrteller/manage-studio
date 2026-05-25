import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';
import { useNavDrawer } from './NavDrawerContext';

export function AppHeader() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { language, setLanguage } = useLanguage();
  const { isOpen, isPinned, toggle, menuButtonRef } = useNavDrawer();

  const toggleLanguage = async () => {
    await setLanguage(language === 'he' ? 'en' : 'he');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header
      className="border-b border-primary-active bg-primary text-on-primary sticky top-0 z-30 shrink-0"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            ref={menuButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls="nav-drawer"
            aria-label={isOpen ? t('nav.close_menu') : t('nav.open_menu')}
            className="text-on-primary hover:bg-primary-hover hover:text-on-primary shrink-0"
          >
            {isPinned ? (
              <PanelLeftClose size={20} aria-hidden />
            ) : (
              <Menu size={20} aria-hidden />
            )}
          </Button>

          <Link
            to="/"
            className="text-on-primary font-bold text-lg truncate hover:opacity-90 focus-visible:outline-2 outline-on-primary outline-offset-2"
          >
            {tenant?.name || 'Ballet School'}
          </Link>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

          {user ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              aria-label={t('nav.logout')}
            >
              {t('nav.logout')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/login')}
              aria-label={t('nav.login')}
            >
              {t('nav.login')}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
