import { useTranslation } from 'react-i18next';

/**
 * Privacy / Terms links from Vite env (SPEC §7 legal checklist).
 * Hidden when URLs are unset — set VITE_PRIVACY_POLICY_URL / VITE_TERMS_URL for prod.
 */
export function LegalFooterLinks() {
  const { t } = useTranslation();
  const privacy = (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim();
  const terms = (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim();
  if (!privacy && !terms) return null;

  return (
    <nav className="flex flex-wrap gap-4 text-sm" aria-label={t('footer.legal_nav')}>
      {privacy ? (
        <a
          href={privacy}
          className="underline opacity-90 hover:opacity-100"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('footer.privacy')}
        </a>
      ) : null}
      {terms ? (
        <a
          href={terms}
          className="underline opacity-90 hover:opacity-100"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('footer.terms')}
        </a>
      ) : null}
    </nav>
  );
}
