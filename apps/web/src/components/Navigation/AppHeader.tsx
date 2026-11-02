import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';
import { useNavDrawer } from './NavDrawerContext';
import { HeaderLogo } from './HeaderLogo';
import { OpalSwiftLogoLink } from '@/components/OpalSwiftShell';

/** Class sets for the two header styles (tenants.chrome_style). */
const CHROME = {
  soft: {
    header: 'app-header-soft',
    icon: 'text-[var(--color-text-primary)] hover:bg-[var(--tint-2)]',
    link: 'outline-primary',
    pill: 'border-[var(--border-card)] text-[var(--color-text-primary)] bg-white/60 hover:bg-[var(--tint-1)]',
    action: 'outline' as const,
  },
  solid: {
    header: 'border-b border-primary-active bg-primary text-on-primary',
    icon: 'text-on-primary hover:bg-primary-hover hover:text-on-primary',
    link: 'outline-on-primary',
    pill: 'border-on-primary text-on-primary bg-transparent hover:bg-primary-hover hover:text-on-primary',
    action: 'secondary' as const,
  },
};

export function AppHeader() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { language, setLanguage } = useLanguage();
  const { isOpen, isPinned, toggle, menuButtonRef } = useNavDrawer();
  const soft = tenant?.chrome_style !== 'solid';
  const c = soft ? CHROME.soft : CHROME.solid;

  const toggleLanguage = async () => {
    await setLanguage(language === 'he' ? 'en' : 'he');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className={`${c.header} sticky top-0 z-30 shrink-0`} role="banner">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button ref={menuButtonRef} type="button" variant="ghost" size="sm" onClick={toggle} aria-expanded={isOpen} aria-controls="nav-drawer" aria-label={isOpen ? t('nav.close_menu') : t('nav.open_menu')} className={`${c.icon} shrink-0`}>
            {isPinned ? <PanelLeftClose size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </Button>
          {tenant ? (
            <Link to="/" className={`flex min-w-0 items-center font-bold text-lg truncate hover:opacity-90 focus-visible:outline-2 ${c.link} outline-offset-2`}>
              <HeaderLogo tenant={tenant} soft={soft} />
            </Link>
          ) : (
            // No studio (platform host): OpalSwift's own logo, linking to the marketing site.
            <OpalSwiftLogoLink className={soft ? '' : 'rounded bg-white px-2 py-1'} />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={toggleLanguage} aria-label={t('common.language')} className={c.pill}>
            {language === 'he' && '🇬🇧 English'}
            {language === 'en' && '🇮🇱 עברית'}
          </Button>
          {user ? (
            <Button variant={c.action} size="sm" onClick={handleLogout} className={soft ? c.pill : undefined} aria-label={t('nav.logout')}>{t('nav.logout')}</Button>
          ) : (
            <Button variant={c.action} size="sm" onClick={() => navigate('/login')} className={soft ? c.pill : undefined} aria-label={t('nav.login')}>{t('nav.login')}</Button>
          )}
        </div>
      </div>
    </header>
  );
}
