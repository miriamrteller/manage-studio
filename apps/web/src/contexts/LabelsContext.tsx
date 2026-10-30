import { createContext, ReactNode, useMemo } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTenant } from '@/hooks/useTenant';
import { VerticalI18nProvider } from '@/i18n/VerticalI18nProvider';
import {
  resolveEntityLabels,
  resolvePresetModules,
  safePreset,
  safeVertical,
  type BusinessPreset,
  type EntityLabels,
  type PresetModules,
  type VerticalId,
} from '@shared/index';

export interface LabelsContextType {
  labels: EntityLabels;
  modules: PresetModules;
  preset: BusinessPreset;
  /** Vertical id (tenants.skin). 'generic' until the tenant loads. */
  vertical: VerticalId;
}

// Module-level constant — never recreated between renders.
// Used as the context default and as the loading fallback before tenant data arrives.
const FALLBACK: LabelsContextType = {
  labels: resolveEntityLabels('programs', {}, 'he'),
  modules: resolvePresetModules('programs'),
  preset: 'programs',
  vertical: 'generic',
};

// Non-null default: consumers always receive valid labels with no null-checks needed.
// Do not use createContext<T | null>(null) here — the fallback is always safe to use.
export const LabelsContext = createContext<LabelsContextType>(FALLBACK);

/**
 * LabelsProvider
 *
 * Resolves entity labels when tenant data arrives and when the UI language changes.
 * Sits inside LanguageProvider in RootLayout — both read from the same
 * cached useTenant() query (React Query deduplicates, no extra network calls).
 *
 * Components consume labels via useEntityLabels(), not useTenant() directly.
 *
 * Sentences follow the same vertical: VerticalI18nProvider points t() at the
 * vertical's wording overlay (photographer only); every other vertical keeps
 * the base 'translation' namespace unchanged.
 */
export function LabelsProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { language } = useLanguage();

  const value = useMemo<LabelsContextType>(() => {
    if (!tenant) {
      return {
        ...FALLBACK,
        labels: resolveEntityLabels('programs', {}, language),
      };
    }
    const preset = safePreset(tenant.business_preset);
    const vertical = safeVertical(tenant.vertical);
    return {
      labels: resolveEntityLabels(
        preset,
        tenant.entity_label_overrides,
        language,
        vertical,
      ),
      modules: resolvePresetModules(preset),
      preset,
      vertical,
    };
  }, [tenant, language]);

  return (
    <LabelsContext.Provider value={value}>
      <VerticalI18nProvider vertical={value.vertical}>{children}</VerticalI18nProvider>
    </LabelsContext.Provider>
  );
}
