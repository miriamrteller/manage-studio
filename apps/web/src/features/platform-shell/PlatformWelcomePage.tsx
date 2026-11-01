import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LegalFooterLinks } from '@/components/LegalFooterLinks';
import { OpalSwiftShell } from '@/components/OpalSwiftShell';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import { useMyStudios } from './useMyStudios';

const selfServeSignup = () => import.meta.env.VITE_ENABLE_SELF_SERVE_SIGNUP === 'true';

const buttonStyle = { backgroundColor: OPALSWIFT_BRAND.ink, color: '#ffffff' };

/**
 * app.opalswift.com: a sign-in gate, not a studio. Signed out → what OpalSwift is
 * and "Sign in". Signed in → links to the user's studios (all of them, plus
 * "Set up a new studio", for the platform owner), or a note when the account has none.
 */
export default function PlatformWelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { user, isLoading: profileLoading } = useCurrentUser();
  const { data: studios, isLoading: studiosLoading } = useMyStudios(user);
  const isSuperAdmin = Boolean(user?.role.includes('super_admin'));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  let body: ReactNode;
  if (sessionLoading || (session && (profileLoading || (user && studiosLoading)))) {
    body = <p role="status">{t('common.loading')}</p>;
  } else if (!session) {
    body = (
      <>
        <h1 className="mb-3 text-3xl font-bold">{t('platform_welcome.headline')}</h1>
        <p className="mb-2 text-lg text-gray-700">{t('platform_welcome.intro')}</p>
        <p className="mb-8 text-gray-700">{t('platform_welcome.sign_in_hint')}</p>
        <div>
          <Button onClick={() => navigate('/login', { state: { from: '/' } })} style={buttonStyle}>
            {t('platform_welcome.sign_in')}
          </Button>
        </div>
      </>
    );
  } else if (studios && studios.length > 0) {
    body = (
      <>
        <h1 className="mb-6 text-3xl font-bold">
          {studios.length === 1 ? t('platform_welcome.your_studio') : t('platform_welcome.your_studios')}
        </h1>
        <ul className="mb-8 space-y-3 text-start">
          {studios.map((studio) => (
            <li key={studio.id}>
              <a
                href={studio.url}
                className="block rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50 focus-visible:outline-2 outline-offset-2"
              >
                <bdi className="block font-semibold" style={{ color: OPALSWIFT_BRAND.ink }}>{studio.name}</bdi>
                <span dir="ltr" className="block text-sm text-gray-700">{studio.url.replace(/^https?:\/\//, '')}</span>
              </a>
            </li>
          ))}
        </ul>
        {isSuperAdmin && <PlatformAdminActions />}
        <div className="mt-6">
          <Button variant="outline" onClick={() => void signOut()}>{t('nav.logout')}</Button>
        </div>
      </>
    );
  } else if (isSuperAdmin) {
    body = (
      <>
        <h1 className="mb-6 text-3xl font-bold">{t('platform_welcome.no_studios_yet')}</h1>
        <PlatformAdminActions />
        <div className="mt-6">
          <Button variant="outline" onClick={() => void signOut()}>{t('nav.logout')}</Button>
        </div>
      </>
    );
  } else if (selfServeSignup()) {
    body = (
      <>
        <h1 className="mb-3 text-3xl font-bold">{t('platform_welcome.no_studio_title')}</h1>
        <p className="mb-8 text-gray-700">{t('platform_welcome.create_studio_hint')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate('/create-studio')} style={buttonStyle}>
            {t('platform_welcome.create_studio')}
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>{t('nav.logout')}</Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="mb-3 text-3xl font-bold">{t('platform_welcome.no_studio_title')}</h1>
        <p className="mb-8 text-gray-700">{t('platform_welcome.not_linked')}</p>
        <div>
          <Button variant="outline" onClick={() => void signOut()}>{t('nav.logout')}</Button>
        </div>
      </>
    );
  }

  return (
    <OpalSwiftShell
      footer={
        <>
          <LegalFooterLinks />
          <a href="https://opalswift.com" className="underline" target="_blank" rel="noopener noreferrer">
            {t('platform_welcome.about')}
          </a>
        </>
      }
    >
      {body}
    </OpalSwiftShell>
  );
}

function PlatformAdminActions() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Link
        to="/platform/onboard"
        className="inline-flex items-center rounded-md px-4 py-2 font-medium focus-visible:outline-2 outline-offset-2"
        style={buttonStyle}
      >
        {t('platform_welcome.new_studio')}
      </Link>
      <Link to="/platform/features" className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 font-medium">
        {t('platform_welcome.platform_features')}
      </Link>
    </div>
  );
}
