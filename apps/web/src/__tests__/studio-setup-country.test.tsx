// @vitest-environment jsdom
/**
 * Setup wizard, step 1: no country row (OpalSwift's studios are in Israel);
 * only the main language is a choice. The request is sent for Israel.
 * Run: pnpm -C apps/web test studio-setup-country.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';
import { INITIAL_FORM, toSetupRequest } from '@/features/platform/lib/studioSetupForm';

function renderWizard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OperatorOnboardingWizard />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function fillNameAndAddress() {
  fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Creative Ballet' } });
  fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'creativeballet' } });
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  h.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  h.rpc.mockReset();
  await i18n.changeLanguage('en');
});

describe('country in the setup wizard', () => {
  it('step 1 has no country row; only the main language is a choice', () => {
    renderWizard();
    expect(screen.queryByText('Country')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Country' })).toBeNull();
    expect(screen.getByLabelText('Main language')).toBeInTheDocument();
    fillNameAndAddress();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('the request is sent for Israel by default: shekels and Israeli phone numbers', () => {
    expect(toSetupRequest({ ...INITIAL_FORM, name: 'x', subdomain: 'x' })).toMatchObject({
      country: 'IL', currency: 'ILS', phoneRegion: 'IL',
    });
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderWizard();
    expect(screen.queryByText('מדינה')).toBeNull();
    expect(screen.queryByText('ישראל')).toBeNull();
  });
});
