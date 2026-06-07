import { createContext, ReactNode, useMemo } from 'react';
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
  labels: resolveEntityLabels('programs'),
  modules: resolvePresetModules('programs'),
  preset: 'programs',
};

// Non-null default: consumers always receive valid labels with no null-checks needed.
// Do not use createContext<T | null>(null) here — the fallback is always safe to use.
export const LabelsContext = createContext<LabelsContextType>(FALLBACK);

/**
 * LabelsProvider
 *
 * Resolves entity labels once when tenant data arrives from React Query.
 * Sits alongside LanguageProvider in RootLayout — both read from the same
 * cached useTenant() query (React Query deduplicates, no extra network calls).
 *
 * Components consume labels via useEntityLabels(), not useTenant() directly.
 */
export function LabelsProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();

  // Recomputes only when the tenant object reference changes (i.e. on refetch).
  // React Query returns a stable TenantConfig reference from cache between renders.
  const value = useMemo<LabelsContextType>(() => {
    if (!tenant) return FALLBACK;
    return {
      labels: tenant.entity_labels,
      modules: tenant.modules,
      preset: tenant.business_preset,
    };
  }, [tenant]);

  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
}
