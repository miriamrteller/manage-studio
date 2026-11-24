import { createContext, ReactNode, useMemo } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTenant } from '@/hooks/useTenant';
import { VerticalI18nProvider } from '@/i18n/VerticalI18nProvider';
import { useStudioSkin } from '@/features/skins/useSkins';
import {
  EXISTING_STUDIO_PROFILE,
  resolveClassLabels,
  resolveEntityLabels,
  resolveStudioLabels,
  resolvePresetModules,
  safePreset,
  safeVertical,
  skinLabelsFor,
  type BusinessPreset,
  type EntityLabels,
  type PresetModules,
  type StudioProfile,
  type VerticalId,
} from '@shared/index';

export interface LabelsContextType {
  labels: EntityLabels;
  /** The word for a class on class pages: always class wording, never a skin's word. */
  classLabels: EntityLabels['offering'];
  modules: PresetModules;
  preset: BusinessPreset;
  /** Vertical id (tenants.skin). 'generic' until the tenant loads. */
  vertical: VerticalId;
  /** How the studio is set up: payment flow and the three switches. */
  profile: StudioProfile;
}

// Module-level constant — never recreated between renders.
// Used as the context default and as the loading fallback before tenant data arrives.
const FALLBACK: LabelsContextType = {
  labels: resolveEntityLabels('programs', {}, 'he'),
  classLabels: resolveClassLabels({}, 'he'),
  modules: resolvePresetModules('programs'),
  preset: 'programs',
  vertical: 'generic',
  profile: EXISTING_STUDIO_PROFILE,
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
  // A data skin's own wording (built-in skins keep their code wording and fetch nothing).
  const { data: skin } = useStudioSkin(tenant?.skin);

  const value = useMemo<LabelsContextType>(() => {
    if (!tenant) {
      return {
        ...FALLBACK,
        labels: resolveEntityLabels('programs', {}, language),
        classLabels: resolveClassLabels({}, language),
      };
    }
    const preset = safePreset(tenant.business_preset);
    const vertical = safeVertical(tenant.vertical);
    const profile = tenant.profile ?? EXISTING_STUDIO_PROFILE;
    return {
      labels: resolveStudioLabels(profile, tenant.entity_label_overrides, language, vertical, skinLabelsFor(skin, language)),
      classLabels: resolveClassLabels(tenant.entity_label_overrides, language),
      modules: resolvePresetModules(preset),
      preset,
      vertical,
      profile,
    };
  }, [tenant, language, skin]);

  return (
    <LabelsContext.Provider value={value}>
      <VerticalI18nProvider vertical={value.vertical} familyAccounts={value.profile.familyAccounts}>{children}</VerticalI18nProvider>
    </LabelsContext.Provider>
  );
}
