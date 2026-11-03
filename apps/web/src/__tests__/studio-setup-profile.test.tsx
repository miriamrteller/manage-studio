// @vitest-environment jsdom
/**
 * Setup wizard: how clients pay and the three switches are pre-filled from the studio type,
 * stay editable, and are sent with the request. No extra step.
 * Run: pnpm -C apps/web test studio-setup-profile.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';
import {
  INITIAL_FORM,
  monthlyFeesForFlow,
  profileDefaultsFor,
  toSetupRequest,
  VERTICALS,
} from '@/features/platform/lib/studioSetupForm';

function renderWizard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OperatorOnboardingWizard />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

async function toTypeStep() {
  fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Creative Ballet' } });
  fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'creativeballet' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('What kind of business is it?');
}

const flow = (name: string) => screen.getByRole('radio', { name });
const sw = (name: RegExp) => screen.getByRole('checkbox', { name });

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  h.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  h.rpc.mockReset();
  await i18n.changeLanguage('en');
});

describe('business profile in the setup wizard', () => {
  it('a new form starts general: both payment flows, every switch off', () => {
    expect(toSetupRequest({ ...INITIAL_FORM, name: 'x', subdomain: 'x' }).profile).toEqual({
      paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: false,
    });
  });

  it('every studio type pre-fills a profile, and "monthly fees?" follows the payment flow', () => {
    for (const vertical of VERTICALS) {
      const profile = profileDefaultsFor(vertical);
      expect(['recurring', 'project', 'both']).toContain(profile.paymentFlow);
    }
    expect(profileDefaultsFor('dance-studio')).toMatchObject({ paymentFlow: 'recurring', teachesClasses: true, familyAccounts: true });
    expect(profileDefaultsFor('photographer')).toMatchObject({ paymentFlow: 'project', teachesClasses: false });
    expect(monthlyFeesForFlow('recurring')).toBe(true);
    expect(monthlyFeesForFlow('both')).toBe(true);
    expect(monthlyFeesForFlow('project')).toBe(false);
  });

  it('choosing a studio type fills the answers on the same step; the owner can change them', async () => {
    renderWizard();
    await toTypeStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    expect(flow('Monthly')).toBeChecked();
    expect(sw(/I teach classes/)).toBeChecked();
    expect(sw(/Parents pay for children/)).toBeChecked();
    expect(sw(/Clients book time slots/)).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /Photographer/ }));
    expect(flow('Per project')).toBeChecked();
    expect(sw(/I teach classes/)).not.toBeChecked();

    fireEvent.click(flow('Both'));
    fireEvent.click(sw(/Parents pay for children/));
    expect(flow('Both')).toBeChecked();
    expect(sw(/Parents pay for children/)).toBeChecked();
    // Nothing blocks: Next is still available.
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
