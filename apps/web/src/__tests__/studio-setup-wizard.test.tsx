// @vitest-environment jsdom
/**
 * Operator setup wizard: plain-language steps, pay-at-the-studio + no documents,
 * owner invite by email, and the "finish setup" checklist.
 * Run: pnpm -C apps/web test studio-setup-wizard.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';

function renderWizard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OperatorOnboardingWizard />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

async function fillStudioStep() {
  fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Creative Ballet' } });
  fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'creativeballet' } });
  next();
  await screen.findByText('What kind of business is it?');
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  h.rpc.mockResolvedValue({ data: true, error: null });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  h.rpc.mockReset();
  h.invoke.mockReset();
  await i18n.changeLanguage('en');
});

describe('studio setup wizard', () => {
  it('starts in English, offers the live providers in plain words, defaults to card + documents', async () => {
    renderWizard();
    expect(screen.getByLabelText('Main language')).toHaveValue('en');
    await fillStudioStep();
    next();
    expect(screen.getByRole('radio', { name: 'By card online, through Grow' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Issued by Grow' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'By card online, through YPay' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'None (not a registered business)' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /mock/i })).not.toBeInTheDocument();
  });

  it('creates a pay-at-the-studio studio with no documents, invites the owner, and shows the checklist', async () => {
    h.invoke.mockResolvedValue({
      data: { tenantId: 't-new', subdomain: 'creativeballet', owner: { status: 'invited' } },
      error: null,
    });
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' }));
    fireEvent.click(screen.getByRole('radio', { name: 'None (not a registered business)' }));
    next();
    expect(screen.getByLabelText('Main colour')).toHaveValue('#5B6CFF');
    next();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'owner@example.com' } });
    next();
    expect(screen.getByText('Check the details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));

    expect(await screen.findByRole('heading', { name: 'Creative Ballet is ready' })).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('provision-studio', {
      body: expect.objectContaining({
        action: 'provision',
        subdomain: 'creativeballet',
        vertical: 'dance-studio',
        plan: 'professional',
        paymentProvider: 'offline',
        invoicingProvider: 'none',
        ownerEmail: 'owner@example.com',
        languageDefault: 'en',
      }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('We emailed an invitation to owner@example.com');
    expect(screen.getByRole('link', { name: 'creativeballet.opalswift.com' })).toHaveAttribute('href', 'https://creativeballet.opalswift.com');
    expect(screen.getByRole('link', { name: "Open the studio's settings" })).toHaveAttribute('href', 'https://creativeballet.opalswift.com/admin/setup');
    expect(screen.getByText('Have a lawyer review the legal documents.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(6);
  });

  it('a failed invite can be sent again', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: { tenantId: 't-new', subdomain: 'studio', owner: { status: 'failed', reason: 'invite_failed' } }, error: null })
      .mockResolvedValueOnce({ data: { owner: { status: 'invited' } }, error: null });
    renderWizard();
    await fillStudioStep();
    next(); next(); next();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'owner@example.com' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send the invitation again' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('We emailed an invitation'));
    expect(h.invoke).toHaveBeenLastCalledWith('provision-studio', {
      body: { action: 'invite_owner', tenantId: 't-new', ownerEmail: 'owner@example.com' },
    });
  });

  it('an owner email from another studio is explained in plain words', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: { json: async () => ({ error: 'email_in_other_studio' }) },
      }),
    });
    renderWizard();
    await fillStudioStep();
    next(); next(); next();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'taken@example.com' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already has an account with another studio');
  });

  it('a taken address stops at the first step', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    renderWizard();
    fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'taken' } });
    next();
    expect(await screen.findByText('This address is already taken.')).toBeInTheDocument();
  });

  it('is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    renderWizard();
    expect(screen.getByRole('heading', { name: 'הקמת סטודיו חדש' })).toBeInTheDocument();
    expect(screen.getByText(/שלב 1 מתוך 6/)).toBeInTheDocument();
  });
});
