import { createContext, ReactNode, useMemo } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTenant } from '@/hooks/useTenant';
import {
  resolveEntityLabels,
  resolvePresetModules,
  type BusinessPreset,
  type EntityLabels,
  type PresetModules,
} from '@shared/index';

export interface LabelsContextType {
  labels: EntityLabels;
  modules: PresetModules;
  preset: BusinessPreset;
}

// Module-level constant — never recreated between renders.
// Used as the context default and as the loading fallback before tenant data arrives.
const FALLBACK: LabelsContextType = {
  labels: resolveEntityLabels('programs', {}, 'he'),
  modules: resolvePresetModules('programs'),
  preset: 'programs',
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
    return {
      labels: resolveEntityLabels(
        tenant.business_preset,
        tenant.entity_label_overrides,
        language,
      ),
      modules: tenant.modules,
      preset: tenant.business_preset,
    };
  }, [tenant, language]);

  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
}
