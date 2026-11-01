import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { tenantHasEnrolmentTerms, useTenantLegalProfile } from '@/legal/useLegalDocument';

interface FooterLink {
  key: string;
  label: string;
  href: string;
  external: boolean;
}

/**
 * Footer legal links.
 *
 * Studio sites: privacy policy and enrolment terms (once the studio has
 * published them in Settings → Legal), accessibility statement and cookie
 * notice (always). The OpalSwift root site: OpalSwift's privacy policy and
 * terms — VITE_PRIVACY_POLICY_URL / VITE_TERMS_URL override the in-app pages.
 */
export function LegalFooterLinks() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { data: legal } = useTenantLegalProfile();

  const links: FooterLink[] = [];
  if (tenant) {
    if (legal?.published) {
      links.push({ key: 'privacy', label: t('footer.privacy'), href: '/legal/studio-privacy', external: false });
      if (tenantHasEnrolmentTerms(legal.vertical)) {
        links.push({ key: 'terms', label: t('footer.enrolment_terms'), href: '/legal/enrolment-terms', external: false });
      }
    }
  } else {
    const privacyUrl = (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim();
    const termsUrl = (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim();
    links.push({
      key: 'privacy',
      label: t('footer.privacy'),
      href: privacyUrl || '/legal/opalswift-privacy',
      external: !!privacyUrl,
    });
    links.push({
      key: 'terms',
      label: t('footer.terms'),
      href: termsUrl || '/legal/platform-terms',
      external: !!termsUrl,
    });
  }
  links.push({ key: 'accessibility', label: t('footer.accessibility'), href: '/legal/accessibility', external: false });
  links.push({ key: 'cookies', label: t('footer.cookies'), href: '/legal/cookies', external: false });

  return (
    <nav className="flex flex-wrap gap-4 text-sm" aria-label={t('footer.legal_nav')}>
      {links.map((link) =>
        link.external ? (
          <a
            key={link.key}
            href={link.href}
            className="underline opacity-90 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
          </a>
        ) : (
          <Link key={link.key} to={link.href} className="underline opacity-90 hover:opacity-100">
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
