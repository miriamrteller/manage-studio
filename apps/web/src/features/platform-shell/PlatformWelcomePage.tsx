import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LegalFooterLinks } from '@/components/LegalFooterLinks';
import { OpalSwiftShell, OPALSWIFT_GEM_SRC } from '@/components/OpalSwiftShell';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { isDevSite } from '@/lib/devStudioPicker';
import { dropSavedSession } from '@/lib/inactivity/signOutForInactivity';
import { withTimeout } from '@/lib/withTimeout';
import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import { isSelfServeSignupEnabled as selfServeSignup, openStudioSignedIn } from '@/features/self-serve/selfServeSignup';
import { useMyStudios, type StudioLink } from './useMyStudios';

/** After this long on "Loading..." the page offers a way out instead of waiting any longer. */
export const SLOW_LOADING_MS = 8_000;

/** True once `active` has stayed true for `ms`; resets when it turns false. */
export function useLoadingTooLong(active: boolean, ms: number): boolean {
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => {
    if (!active) {
      setTooLong(false);
      return;
    }
    const timer = window.setTimeout(() => setTooLong(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
  return tooLong;
}

/**
 * app.opalswift.com: a sign-in gate, not a studio. Signed out → what OpalSwift is
 * and "Sign in". Signed in → links to the user's studios (all of them, plus
 * "Set up a new studio", for the platform owner), or a note when the account has none.
 */
export default function PlatformWelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { user, isLoading: profileLoading, profileTimedOut } = useCurrentUser();
  const { data: studios, isLoading: studiosLoading } = useMyStudios(user);
  const isSuperAdmin = Boolean(user?.role.includes('super_admin'));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const loading = sessionLoading || Boolean(session && (profileLoading || (user && studiosLoading)));
  const tooSlow = useLoadingTooLong(loading, SLOW_LOADING_MS);

  // Sign in again from scratch: drop the saved session here (even if the sign-out call hangs),
  // then open the sign-in page. The way out of a stuck "Loading...".
  const signInAgain = async () => {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 3_000, null).catch(() => null);
    dropSavedSession();
    window.location.assign('/login');
  };

  let body: ReactNode;
  if ((loading && tooSlow) || (!loading && session && profileTimedOut)) {
    body = (
      <div role="alert" className="space-y-4">
        <h1 className="text-2xl font-bold">{t('platform_welcome.slow_title')}</h1>
        <p className="text-gray-700">{t('platform_welcome.slow_body')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t('platform_welcome.slow_reload')}
          </Button>
          <Button variant="outline" onClick={() => void signInAgain()}>
            {t('platform_welcome.slow_sign_in_again')}
          </Button>
        </div>
      </div>
    );
  } else if (loading) {
    body = <p role="status">{t('common.loading')}</p>;
  } else if (!session) {
    body = (
      <>
        <img
          src={OPALSWIFT_GEM_SRC}
          alt=""
          width={72}
          height={72}
          className="mx-auto mb-6 h-[72px] w-[72px]"
          style={{ filter: 'drop-shadow(0 3px 12px rgba(123, 97, 255, 0.28))' }}
        />
        <h1 className="mb-3 text-3xl font-bold">{t('platform_welcome.headline')}</h1>
        <p className="mb-2 text-lg text-gray-700">{t('platform_welcome.intro')}</p>
        <p className="mb-8 text-gray-700">{t('platform_welcome.sign_in_hint')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {selfServeSignup() && (
            <Button variant="primary" onClick={() => navigate('/create-studio')}>
              {t('self_serve.start_button')}
            </Button>
          )}
          <Button
            variant={selfServeSignup() ? 'outline' : 'primary'}
            onClick={() => navigate('/login', { state: { from: '/' } })}
          >
            {t('platform_welcome.sign_in')}
          </Button>
        </div>
      </>
    );
  } else {
    // Signed in: greeting, then one "Your studios" card. Logout lives in the header.
    const hasStudios = Boolean(studios && studios.length > 0);
    const studiosTitle = isSuperAdmin
      ? t('platform_welcome.studios_title')
      : studios && studios.length === 1
        ? t('platform_welcome.your_studio')
        : t('platform_welcome.your_studios');
    let card: ReactNode;
    if (hasStudios && isSuperAdmin) {
      card = <StudiosTable studios={studios!} />;
    } else if (hasStudios) {
      card = <StudioLinks studios={studios!} />;
    } else if (isSuperAdmin) {
      card = (
        <EmptyStudios hint={t('platform_welcome.no_studios_hint')} title={t('platform_welcome.no_studios_yet')}>
          <Button variant="primary" onClick={() => navigate('/platform/onboard')}>
            {t('platform_welcome.new_studio')}
          </Button>
        </EmptyStudios>
      );
    } else if (selfServeSignup()) {
      card = (
        <EmptyStudios hint={t('platform_welcome.create_studio_hint')} title={t('platform_welcome.no_studio_title')}>
          <Button variant="primary" onClick={() => navigate('/create-studio')}>
            {t('platform_welcome.create_studio')}
          </Button>
        </EmptyStudios>
      );
    } else {
      card = <EmptyStudios hint={t('platform_welcome.not_linked')} title={t('platform_welcome.no_studio_title')} />;
    }

    body = (
      <>
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            {user?.full_name
              ? t('platform_welcome.welcome_back_name', { name: user.full_name })
              : t('platform_welcome.welcome_back')}
          </h1>
          {isSuperAdmin && <p className="mt-1 text-gray-700">{t('platform_welcome.signed_in_hint')}</p>}
        </div>

        <section aria-labelledby="studios-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="studios-heading" className="text-xl font-semibold">{studiosTitle}</h2>
            {isSuperAdmin && hasStudios && (
              <Button variant="primary" size="sm" onClick={() => navigate('/platform/onboard')}>
                {t('platform_welcome.new_studio')}
              </Button>
            )}
          </div>
          {card}
        </section>

        {isSuperAdmin && (
          <Link
            to="/platform/features"
            className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-2 outline-offset-2"
          >
            <span>
              <span className="block font-semibold" style={{ color: OPALSWIFT_BRAND.ink }}>
                {t('platform_welcome.platform_features')}
              </span>
              <span className="block text-sm text-gray-700">{t('platform_welcome.platform_features_hint')}</span>
            </span>
            <span aria-hidden="true" className="text-gray-700 rtl:rotate-180">›</span>
          </Link>
        )}
        {isSuperAdmin && isDevSite() && (
          <Link
            to="/platform/billing"
            className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-2 outline-offset-2"
          >
            <span>
              <span className="block font-semibold" style={{ color: OPALSWIFT_BRAND.ink }}>
                {t('platform_welcome.platform_billing')}
              </span>
              <span className="block text-sm text-gray-700">{t('platform_welcome.platform_billing_hint')}</span>
            </span>
            <span aria-hidden="true" className="text-gray-700 rtl:rotate-180">›</span>
          </Link>
        )}
        {isSuperAdmin && (
          <Link
            to="/platform/skins"
            className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-2 outline-offset-2"
          >
            <span>
              <span className="block font-semibold" style={{ color: OPALSWIFT_BRAND.ink }}>
                {t('platform_welcome.platform_skins')}
              </span>
              <span className="block text-sm text-gray-700">{t('platform_welcome.platform_skins_hint')}</span>
            </span>
            <span aria-hidden="true" className="text-gray-700 rtl:rotate-180">›</span>
          </Link>
        )}
      </>
    );
  }

  const signedIn = Boolean(session) && !(sessionLoading || profileLoading);
  return (
    <OpalSwiftShell
      wide={signedIn}
      headerActions={
        signedIn ? (
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {t('nav.logout')}
          </Button>
        ) : undefined
      }
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

function EmptyStudios({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="py-6 text-center">
      <p className="mb-1 text-lg font-semibold">{title}</p>
      <p className="mb-5 text-gray-700">{hint}</p>
      {children}
    </div>
  );
}

/**
 * A studio's address, opened signed in: a plain click hands this session to
 * the studio (/auth/session-handoff); a new-tab or modified click keeps the
 * plain address (it opens the studio's sign-in).
 */
function openSignedIn(studio: StudioLink) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void openStudioSignedIn(studio.subdomain);
  };
}

function StudioLinks({ studios }: { studios: StudioLink[] }) {
  return (
    <ul className="space-y-3">
      {studios.map((studio) => (
        <li key={studio.id}>
          <a
            href={studio.url}
            onClick={openSignedIn(studio)}
            className="block rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50 focus-visible:outline-2 outline-offset-2"
          >
            <bdi className="block font-semibold" style={{ color: OPALSWIFT_BRAND.ink }}>{studio.name}</bdi>
            <span dir="ltr" className="block text-sm text-gray-700">{studio.url.replace(/^https?:\/\//, '')}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const STATUS_KEYS: Record<string, string> = {
  trialing: 'platform_welcome.status_trialing',
  active: 'platform_welcome.status_active',
  past_due: 'platform_welcome.status_past_due',
  canceled: 'platform_welcome.status_canceled',
};

/** The platform owner's read-only list of every studio. */
function StudiosTable({ studios }: { studios: StudioLink[] }) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language.startsWith('he') ? 'he-IL' : 'en-GB', { dateStyle: 'medium' });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="px-2 py-2 text-start font-semibold">{t('platform_welcome.col_name')}</th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">{t('platform_welcome.col_source')}</th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">{t('platform_welcome.col_status')}</th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">{t('platform_welcome.col_created')}</th>
          </tr>
        </thead>
        <tbody>
          {studios.map((studio) => (
            <tr key={studio.id} className="border-b border-gray-100">
              <td className="px-2 py-2">
                <a
                  href={studio.url}
                  onClick={openSignedIn(studio)}
                  className="font-semibold underline"
                  style={{ color: OPALSWIFT_BRAND.ink }}
                >
                  <bdi>{studio.name}</bdi>
                </a>
                <span dir="ltr" className="block text-xs text-gray-700">{studio.url.replace(/^https?:\/\//, '')}</span>
              </td>
              <td className="px-2 py-2">
                {t(studio.signupSource === 'self_serve' ? 'platform_welcome.source_self_serve' : 'platform_welcome.source_operator')}
              </td>
              <td className="px-2 py-2">{studio.status ? t(STATUS_KEYS[studio.status] ?? studio.status) : ''}</td>
              <td className="px-2 py-2">{studio.createdAt ? date.format(new Date(studio.createdAt)) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
