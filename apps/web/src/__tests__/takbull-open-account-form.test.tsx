// @vitest-environment jsdom
/**
 * Settings → Payments, "Open my Takbull account (testing)" (dev website, beta switch only):
 * prefilled details sit behind "Details we filled in for you"; the owner types the password,
 * ID number and bank details; Takbull's refusals are shown in plain words.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  devSite: true,
  feature: true,
  invoke: vi.fn(),
  prefill: {} as Record<string, unknown>,
}));

vi.mock('@/lib/devStudioPicker', () => ({ isDevSite: () => h.devSite }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('@/hooks/useFeatureGate', () => ({ useFeatureGate: () => ({ hasFeature: () => h.feature }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { TakbullOpenAccountForm, passwordOk } from '@/features/settings/components/TakbullOpenAccountForm';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TakbullOpenAccountForm />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  h.devSite = true;
  h.feature = true;
  h.prefill = {
    opened: false, openedAt: null, businessName: 'Lens Studio Ltd', businessNumber: '515555555', businessStatus: 'company',
    businessType: 2, businessEmail: 'owner@lens.test', phone: '0501234567', street: 'Herzl 1', city: '',
    ownerFirstName: 'Dana', ownerLastName: 'Levi',
  };
  h.invoke.mockReset().mockImplementation(async (_name: string, opts: { body: { action: string } }) => {
    if (opts.body.action === 'prefill') return { data: { ok: true, prefill: h.prefill }, error: null };
    return { data: { ok: true, merchant_id: 'm1' }, error: null };
  });
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('Open my Takbull account', () => {
  it('is not shown on the live site', () => {
    h.devSite = false;
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills the login email and hides what we filled in, but asks for the missing city', async () => {
    renderIt();
    expect(await screen.findByLabelText(/Takbull login email/)).toHaveValue('owner@lens.test');
    expect(screen.getByText('Details we filled in for you')).toBeInTheDocument();
    // City was empty, so it is asked in the open.
    const city = screen.getByLabelText('City');
    expect(city.closest('details')).toBeNull();
    expect(screen.getByLabelText('Business name').closest('details')).not.toBeNull();
  });

  it('sends the typed details and says when it is open', async () => {
    renderIt();
    await screen.findByLabelText(/Takbull password/);
    fireEvent.change(screen.getByLabelText(/Takbull password/), { target: { value: 'Strong#Pass1' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Tel Aviv' } });
    fireEvent.change(screen.getByLabelText("Owner's ID number"), { target: { value: '123456782' } });
    fireEvent.change(screen.getByLabelText('Bank number'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Branch number'), { target: { value: '345' } });
    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '678901' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open my Takbull account' }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('takbull-open-account', expect.objectContaining({
      body: { action: 'open', fields: expect.objectContaining({ city: 'Tel Aviv', businessType: 2, password: 'Strong#Pass1', loginEmail: 'owner@lens.test' }) },
    })));
  });

  it('explains Takbull\'s refusal', async () => {
    h.invoke.mockImplementation(async (_n: string, opts: { body: { action: string } }) =>
      opts.body.action === 'prefill'
        ? { data: { ok: true, prefill: h.prefill }, error: null }
        : { data: { ok: false, code: 'not_allowed' }, error: null });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Open my Takbull account' }));
    expect(await screen.findByText(/can't open studio accounts yet/)).toBeInTheDocument();
  });

  it('shows when the account is already open', async () => {
    h.prefill = { ...h.prefill, opened: true, openedAt: '2026-11-10T10:00:00Z' };
    renderIt();
    expect(await screen.findByText(/Takbull account was opened on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open my Takbull account' })).not.toBeInTheDocument();
  });

  it('knows Takbull\'s password rule', () => {
    expect(passwordOk('Strong#Pass1')).toBe(true);
    expect(passwordOk('strongpass')).toBe(false);
  });
});
