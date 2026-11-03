import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { OpalSwiftShell } from '@/components/OpalSwiftShell';
import { goToPlatformSignup, platformSignupUrl } from '@/lib/platformSignup';

/** /signup on app.opalswift.com: there is no studio to join, so it sends people to OpalSwift's signup. */
export function PlatformSignupRedirect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useEffect(() => {
    goToPlatformSignup(navigate, true);
  }, [navigate]);
  return (
    <OpalSwiftShell>
      <p className="text-lg text-gray-700" role="status">
        {t('platform_welcome.signup_redirecting')}{' '}
        <a href={platformSignupUrl()} className="font-semibold underline">
          {t('platform_welcome.signup_redirect_link')}
        </a>
      </p>
    </OpalSwiftShell>
  );
}

/** A page that belongs to one studio (classes, booking, enrolment), opened on app.opalswift.com. */
export function PlatformStudioOnlyNotice() {
  const { t } = useTranslation();
  return (
    <OpalSwiftShell>
      <h1 className="mb-4 text-3xl font-bold">{t('platform_welcome.studio_only_title')}</h1>
      <p className="mb-6 text-lg text-gray-700">{t('platform_welcome.studio_only_body')}</p>
      <Link to="/" className="font-semibold underline">
        {t('platform_welcome.studio_only_home')}
      </Link>
    </OpalSwiftShell>
  );
}
