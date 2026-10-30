import { useContext, type ReactNode } from 'react';
import { I18nContext, I18nextProvider, getI18n } from 'react-i18next';
import type { i18n } from 'i18next';
import type { VerticalId } from '@shared/index';
import { overlayNamespaceFor } from './verticalNamespace';

/**
 * Points every useTranslation() / <Trans> below it at the tenant's wording
 * overlay namespace (e.g. 'photographer'). Keys the overlay doesn't define fall
 * back to the base 'translation' namespace (fallbackNS in i18n.ts), so
 * existing t('...') calls pick up overrides with no component changes.
 *
 * Verticals without an overlay (dance, generic, unknown) keep the parent's
 * defaultNS, i.e. exactly the base wording.
 */
export function VerticalI18nProvider({
  vertical,
  children,
}: {
  vertical: VerticalId | null | undefined;
  children: ReactNode;
}) {
  // I18nContext also carries the defaultNS of an enclosing I18nextProvider at
  // runtime; its published type only declares i18n.
  const parent = useContext(I18nContext) as { i18n?: i18n; defaultNS?: string | string[] } | undefined;
  const instance = parent?.i18n ?? getI18n();
  // No i18next instance (isolated unit renders): nothing to switch.
  if (!instance) return <>{children}</>;

  const overlay = overlayNamespaceFor(vertical);
  return (
    <I18nextProvider i18n={instance} defaultNS={overlay ?? parent?.defaultNS}>
      {children}
    </I18nextProvider>
  );
}
