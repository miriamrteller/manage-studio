// @vitest-environment jsdom
/**
 * /platform/billing (dev website only): shows whether OpalSwift's Takbull keys are saved, saves
 * them through save_platform_takbull_credentials, tests them with verify-takbull-credentials
 * { scope: 'platform' }, and lists every studio's billing details.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  devSite: true,
  status: { keys_saved: false, keys_saved_at: null as string | null, charging_enabled: false },
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/devStudioPicker', () => ({ isDevSite: () => h.devSite }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { PlatformBilling } from '@/features/platform/components/PlatformBilling';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PlatformBilling />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  h.devSite = true;
  h.status = { keys_saved: false, keys_saved_at: null, charging_enabled: false };
  h.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'platform_billing_status') return { data: [h.status], error: null };
    if (name === 'platform_billing_overview') {
      return {
        data: [{
          tenant_id: 't1', name: 'Lens Studio', subdomain: 'lensstudio', sub_status: 'trialing',
          trial_ends_at: null, founder: true, free_until: '2027-01-01', monthly_amount_agorot: null,
          next_charge_on: null, card_last4: '4242', failed_attempts: 0, last_paid_month: null,
        }],
        error: null,
      };
    }
    return { data: null, error: null };
  });
  h.invoke.mockReset().mockResolvedValue({ data: { ok: true, valid: true }, error: null });
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('Platform → Billing', () => {
  it('is not shown on the live site', () => {
    h.devSite = false;
    renderIt();
    expect(screen.getByText(/dev website only/i)).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('says when no keys are saved, and that charging is off', async () => {
    renderIt();
    expect(await screen.findByText('No keys saved yet.')).toBeInTheDocument();
    expect(screen.getByText('Monthly charging is off.')).toBeInTheDocument();
  });

  it('says when keys are saved', async () => {
    h.status = { keys_saved: true, keys_saved_at: '2026-11-10T10:00:00Z', charging_enabled: false };
    renderIt();
    expect(await screen.findByText(/^Keys saved on /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace keys' })).toBeInTheDocument();
  });

  it('saves both keys trimmed', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: ' k1 ' } });
    fireEvent.change(screen.getByLabelText('API secret'), { target: { value: ' s1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save keys' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('save_platform_takbull_credentials', { p_api_key: 'k1', p_api_secret: 's1' }),
    );
  });

  it('tests OpalSwift\'s keys, not a studio\'s', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText("Takbull accepted OpalSwift's keys.")).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('verify-takbull-credentials', { body: { scope: 'platform' } });
  });

  it('lists each studio with its card', async () => {
    renderIt();
    expect(await screen.findByText('Lens Studio')).toBeInTheDocument();
    expect(screen.getByText('•••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Founder')).toBeInTheDocument();
  });

  it('switches monthly charging on', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn monthly charging on' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('set_platform_charging', { p_enabled: true }));
  });

  it('charges one studio now and says what happened', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, studios: [{ tenantId: 't1', result: 'succeeded' }] }, error: null });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Charge now (testing)' }));
    expect(await screen.findByText('Charged. The next charge moved on a month.')).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('run-platform-billing', { body: { tenant_id: 't1' } });
  });

  it('asks to switch charging on first', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, code: 'charging_off' }, error: null });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Charge now (testing)' }));
    expect(await screen.findByText('Turn monthly charging on first.')).toBeInTheDocument();
  });
});
