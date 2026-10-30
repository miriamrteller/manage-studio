/**
 * Test harness for vertical-aware rendering: the real i18next instance (with
 * the photographer overlay registered) + the real LabelsProvider, fed by the
 * fake tenant in fakeTenantState.ts (see there for the vi.mock lines).
 */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '@/i18n/i18n';
import { LabelsProvider } from '@/contexts/LabelsContext';
import { setLanguageState } from './fakeTenantState';

export { setTenant, fakeTenant, type FakeTenantKind } from './fakeTenantState';

export async function setLanguage(language: 'en' | 'he') {
  setLanguageState(language);
  await i18n.changeLanguage(language);
}

/** Renders the current pathname so redirects can be asserted. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

export function renderInApp(
  ui: ReactElement,
  options: { path?: string; initialEntry?: string | { pathname: string; search?: string; state?: unknown }; extraRoutes?: Record<string, ReactNode> } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = options.path ?? '/';
  const initialEntry = options.initialEntry ?? path;
  const tree = () => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LabelsProvider>
            <Routes>
              <Route path={path} element={ui} />
              {Object.entries(options.extraRoutes ?? {}).map(([p, el]) => (
                <Route key={p} path={p} element={el} />
              ))}
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </LabelsProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
  const result = render(tree());
  /** Re-render the same tree (e.g. after setTenant) without remounting. */
  const rerenderApp = () => result.rerender(tree());
  return { ...result, queryClient, rerenderApp };
}

/** Base-file (dance) value for a key, straight from en.json / he.json. */
export function baseValue(key: string, language: 'en' | 'he' = 'en'): string {
  const value = i18n.getResource(language, 'translation', key);
  if (typeof value !== 'string') throw new Error(`No base value for ${key}`);
  return value;
}
