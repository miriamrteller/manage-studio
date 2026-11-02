// @vitest-environment jsdom
/**
 * Setup wizard, step 1: the country is Israel unless the owner says otherwise.
 * Payments, tax documents and legal templates are Israel-only, so another
 * country needs a warning and an explicit tick.
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
  it('shows Israel, with no dropdown until "Not in Israel?" is pressed', () => {
    renderWizard();
    expect(screen.getByRole('group', { name: 'Country' })).toHaveTextContent('Israel');
    expect(screen.queryByRole('combobox', { name: 'Country' })).toBeNull();
    fillNameAndAddress();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('another country shows the warning and needs a tick to continue', () => {
    renderWizard();
    fillNameAndAddress();
    const more = screen.getByRole('button', { name: 'Not in Israel?' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    const select = screen.getByRole('combobox', { name: 'Country' });
    expect(screen.getByRole('note')).toHaveTextContent(/payment providers, tax documents and legal templates are for Israel only/);
    expect(select).toHaveAccessibleDescription(/for Israel only/);
    // Still Israel: nothing to confirm.
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    fireEvent.change(select, { target: { value: 'US' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /My studio will arrange its own payments/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    // Changing the country again asks again.
    fireEvent.change(select, { target: { value: 'IL' } });
    fireEvent.change(select, { target: { value: 'US' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('the request keeps Israel by default; a confirmed US studio gets USD', () => {
    expect(toSetupRequest({ ...INITIAL_FORM, name: 'x', subdomain: 'x' })).toMatchObject({
      country: 'IL', currency: 'ILS', phoneRegion: 'IL',
    });
    expect(toSetupRequest({ ...INITIAL_FORM, name: 'x', subdomain: 'x', country: 'US' })).toMatchObject({
      country: 'US', currency: 'USD', phoneRegion: 'US',
    });
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderWizard();
    expect(screen.getByRole('group', { name: 'מדינה' })).toHaveTextContent('ישראל');
    fireEvent.click(screen.getByRole('button', { name: 'לא בישראל?' }));
    expect(screen.getByRole('note')).toHaveTextContent(/מיועדים לישראל בלבד/);
    fireEvent.change(screen.getByRole('combobox', { name: 'מדינה' }), { target: { value: 'US' } });
    expect(screen.getByRole('checkbox', { name: /הסטודיו שלי ידאג בעצמו/ })).toBeInTheDocument();
  });
});
