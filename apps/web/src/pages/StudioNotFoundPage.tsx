import { useTranslation } from 'react-i18next';
import { OPALSWIFT_SITE_URL, OpalSwiftShell } from '@/components/OpalSwiftShell';

/**
 * Shown on a studio host (subdomain or custom domain) that has no studio.
 * Neutral OpalSwift branding: no studio name, no sign-in or enrol actions,
 * only a way back to opalswift.com.
 */
export default function StudioNotFoundPage({ host }: { host: string }) {
  const { t } = useTranslation();
  return (
    <OpalSwiftShell>
      <h1 className="mb-4 text-3xl font-bold">{t('studio_not_found.title')}</h1>
      <p className="text-lg text-gray-700">
        {t('studio_not_found.message_before')}
        <bdi dir="ltr" className="font-semibold">{host}</bdi>
        {t('studio_not_found.message_after')}
      </p>
      <p className="mt-6 text-gray-700">
        {t('studio_not_found.opalswift_hint')}{' '}
        <a href={OPALSWIFT_SITE_URL} className="font-semibold underline">
          {t('studio_not_found.opalswift_link')}
        </a>
      </p>
    </OpalSwiftShell>
  );
}
