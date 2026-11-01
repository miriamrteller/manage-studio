import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks } from '@/lib/legalLinks';

/**
 * Footer links to the studio's privacy policy, terms and accessibility statement
 * (falls back to the platform VITE_* URLs). Hidden when none is set.
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
