import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks } from '@/lib/legalLinks';

/**
 * One-line privacy notice for any public form that collects personal details
 * (Privacy Protection Law §11; docs/legal/APP-GAPS.md "Privacy notice on public forms").
 * The link goes to the studio's policy, or the platform's on the root site.
 */
export function PrivacyNotice({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { privacy } = resolveLegalLinks(tenant);

  return (
    <p className={`text-xs text-muted-foreground ${className}`.trim()}>
      {t('legal.privacy_notice')}{' '}
      {privacy ? (
        <a href={privacy} target="_blank" rel="noopener noreferrer" className="underline">
          {t('footer.privacy')}
        </a>
      ) : null}
    </p>
  );
}
