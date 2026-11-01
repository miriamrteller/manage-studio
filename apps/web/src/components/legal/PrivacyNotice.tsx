import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks } from '@/lib/legalLinks';

export type PrivacyNoticePurpose = 'enrolment' | 'inquiry' | 'booking' | 'quote' | 'pay' | 'signup';

/**
 * One-line notice at the point of collection (Privacy Protection Law §11), shown next to
 * every public form that collects personal data: what the details are used for, and a
 * link to the privacy policy of the studio (or of OpalSwift on the root site).
 */
export function PrivacyNotice({ purpose, className = '' }: { purpose: PrivacyNoticePurpose; className?: string }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { privacy } = resolveLegalLinks(tenant);

  return (
    <p className={`text-xs text-muted-foreground ${className}`.trim()} data-testid="privacy-notice">
      {t(`legal.privacy_notice.${purpose}`)}{' '}
      {privacy ? (
        <a href={privacy} className="underline" target="_blank" rel="noopener noreferrer">
          {t('legal.privacy_policy')}
        </a>
      ) : (
        <span>{t('legal.privacy_policy')}</span>
      )}
      .
    </p>
  );
}
