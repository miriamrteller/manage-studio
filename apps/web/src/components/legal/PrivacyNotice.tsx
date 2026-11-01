import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';

export type PrivacyNoticePurpose = 'enquiry' | 'booking' | 'payment' | 'enrolment' | 'signup' | 'quote';

/**
 * One-line privacy notice for any form that collects personal details
 * (Privacy Protection Law §11): what the details are used for, and a link to
 * the policy — the studio's on a studio site, OpalSwift's on the root site.
 */
export function PrivacyNotice({ purpose, className }: { purpose: PrivacyNoticePurpose; className?: string }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const href = tenant ? '/legal/studio-privacy' : '/legal/opalswift-privacy';

  return (
    <p className={cn('text-xs text-muted-foreground', className)} data-testid="privacy-notice">
      {t(`legal.notice.${purpose}`)}{' '}
      <Link to={href} className="underline" target="_blank" rel="noopener noreferrer">
        {t('legal.notice.policy_link')}
      </Link>
    </p>
  );
}
