import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isInternalLegalLink } from '@/lib/legalLinks';
import { useLegalLinks } from '@/legal/useLegalLinks';
import { cn } from '@/lib/utils';

export type PrivacyNoticePurpose = 'enquiry' | 'booking' | 'payment' | 'enrolment' | 'signup' | 'quote';

/**
 * One-line privacy notice for any public form that collects personal details
 * (Privacy Protection Law §11): what the details are used for, and a link to
 * the policy. A studio that hasn't set up its policy yet links to its
 * /legal/studio-privacy page, which shows how to contact the studio.
 */
export function PrivacyNotice({ purpose, className }: { purpose?: PrivacyNoticePurpose; className?: string }) {
  const { t } = useTranslation();
  const links = useLegalLinks();
  const href = links.privacy ?? (links.isTenant ? '/legal/studio-privacy' : '/legal/opalswift-privacy');

  return (
    <p className={cn('text-xs text-muted-foreground', className)} data-testid="privacy-notice">
      {purpose ? t(`legal.notice.${purpose}`) : t('legal.privacy_notice')}{' '}
      {isInternalLegalLink(href) ? (
        <Link to={href} className="underline" target="_blank" rel="noopener noreferrer">
          {t('legal.notice.policy_link')}
        </Link>
      ) : (
        <a href={href} className="underline" target="_blank" rel="noopener noreferrer">
          {t('legal.notice.policy_link')}
        </a>
      )}
    </p>
  );
}
