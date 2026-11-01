import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isInternalLegalLink } from '@/lib/legalLinks';
import { useLegalLinks } from '@/legal/useLegalLinks';

/**
 * Footer legal links. Studio sites: privacy policy and terms (the studio's own
 * links, or its generated pages once published), accessibility statement and
 * cookie notice. The OpalSwift root site: OpalSwift's privacy policy and terms
 * (VITE_* links, else the in-app pages).
 */
export function LegalFooterLinks() {
  const { t } = useTranslation();
  const links = useLegalLinks();

  const items = [
    { key: 'privacy', label: t('footer.privacy'), href: links.privacy ?? (links.isTenant ? null : '/legal/opalswift-privacy') },
    {
      key: 'terms',
      label: links.isTenant ? t('footer.enrolment_terms') : t('footer.terms'),
      href: links.terms ?? (links.isTenant ? null : '/legal/platform-terms'),
    },
    { key: 'accessibility', label: t('footer.accessibility'), href: links.accessibility ?? '/legal/accessibility' },
    { key: 'cookies', label: t('footer.cookies'), href: '/legal/cookies' },
  ].filter((item): item is { key: string; label: string; href: string } => Boolean(item.href));

  return (
    <nav className="flex flex-wrap gap-4 text-sm" aria-label={t('footer.legal_nav')}>
      {items.map((item) =>
        isInternalLegalLink(item.href) ? (
          <Link key={item.key} to={item.href} className="underline opacity-90 hover:opacity-100">
            {item.label}
          </Link>
        ) : (
          <a
            key={item.key}
            href={item.href}
            className="underline opacity-90 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.label}
          </a>
        ),
      )}
    </nav>
  );
}
