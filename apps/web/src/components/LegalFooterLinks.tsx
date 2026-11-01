import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks } from '@/lib/legalLinks';

/**
 * Privacy / Terms / Accessibility links in the footer.
 * Tenant sites show the studio's own pages (Admin → Setup → Settings → Legal pages);
 * the root site falls back to VITE_PRIVACY_POLICY_URL / VITE_TERMS_URL / VITE_ACCESSIBILITY_URL.
 * Hidden when nothing is set.
 */
export function LegalFooterLinks() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const links = resolveLegalLinks(tenant);
  const items = [
    { href: links.privacy, label: t('footer.privacy') },
    { href: links.terms, label: t('footer.terms') },
    { href: links.accessibility, label: t('footer.accessibility') },
  ].filter((item): item is { href: string; label: string } => Boolean(item.href));

  if (items.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-4 text-sm" aria-label={t('footer.legal_nav')}>
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          className="underline opacity-90 hover:opacity-100"
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
