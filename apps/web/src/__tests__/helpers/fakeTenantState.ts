/**
 * Mutable fake tenant + language for vertical tests. Kept free of app imports
 * so vi.mock factories can load it without import cycles:
 *
 *   vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
 *   vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
 */
export type FakeTenantKind = 'dance' | 'generic' | 'none' | 'photographer' | 'beautician';

const state: { tenant: Record<string, unknown> | null; language: 'en' | 'he' } = {
  tenant: null,
  language: 'en',
};

export function fakeTenant(kind: FakeTenantKind): Record<string, unknown> | null {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Studio',
    subdomain: 'test',
    language: 'en',
    language_default: 'en',
    country: 'IL',
    currency: 'ILS',
    entity_label_overrides: {},
    enabled_features: [],
  };
  switch (kind) {
    case 'dance':
      return { ...base, business_preset: 'programs', vertical: 'dance-studio' };
    case 'generic':
      return { ...base, business_preset: 'programs', vertical: 'generic' };
    case 'none':
      // Older rows: no skin/vertical at all.
      return { ...base, business_preset: 'programs' };
    case 'beautician':
      return { ...base, business_preset: 'services', vertical: 'beautician' };
    case 'photographer':
      return { ...base, business_preset: 'services', vertical: 'photographer' };
  }
}

export function setTenant(kind: FakeTenantKind | null) {
  state.tenant = kind ? fakeTenant(kind) : null;
}

export function setLanguageState(language: 'en' | 'he') {
  state.language = language;
}

export function tenantHookMock() {
  return {
    useTenant: () => state.tenant,
    useTenantQuery: () => ({ tenant: state.tenant, isLoading: false }),
  };
}

export function languageHookMock() {
  return {
    useLanguage: () => ({
      language: state.language,
      direction: state.language === 'he' ? 'rtl' : 'ltr',
      isRTL: state.language === 'he',
      changeLanguage: () => undefined,
      setLanguage: () => undefined,
    }),
  };
}

