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
const YPAY = 'Issued by YPay';
const GREEN_INVOICE = 'Issued by Green Invoice';

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
  it('starts in English with Grow first and Grow documents, keeps pay at the studio and the other services available', async () => {
    renderWizard();
    expect(screen.getByLabelText('Main language')).toHaveValue('en');
    await fillStudioStep();
    next();
    const payRadios = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'ss-payment');
    expect(payRadios[0]).toHaveAccessibleName('By card online, through Grow');
    expect(screen.getByRole('radio', { name: 'By card online, through Grow' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Issued by Grow' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'None (not a registered business)' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'By card online, through YPay' })).toBeInTheDocument();
    // The other invoicing services sit behind "I already use another invoicing service".
    expect(screen.queryByRole('radio', { name: 'Issued by Green Invoice' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'I already use another invoicing service' }));
    expect(screen.getByRole('radio', { name: 'Issued by Green Invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /mock/i })).not.toBeInTheDocument();
  });

  it('documents follow the payment choice until the owner picks another invoicing service', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'By card online, through Invoice4U' }));
    expect(screen.getByRole('radio', { name: 'Issued by Invoice4U' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' }));
    expect(screen.getByRole('radio', { name: 'None (not a registered business)' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'I already use another invoicing service' }));
    fireEvent.click(screen.getByRole('radio', { name: GREEN_INVOICE }));
    fireEvent.click(screen.getByRole('radio', { name: 'By card online, through Grow' }));
    // Green Invoice works with any payment choice, so it is kept.
    expect(screen.getByRole('radio', { name: GREEN_INVOICE })).toBeChecked();
  });

  it('only offers invoicing services that can issue documents for the payment choice', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    const otherServices = () => {
      fireEvent.click(screen.getByRole('radio', { name: 'I already use another invoicing service' }));
      return screen
        .getAllByRole('radio')
        .filter((r) => (r as HTMLInputElement).name === 'ss-invoicing')
        .map((r) => r.closest('label')?.textContent?.trim());
    };
    // Pay at the studio: only services with standalone documents.
    fireEvent.click(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' }));
    expect(otherServices()).toEqual([YPAY, GREEN_INVOICE]);
    // Grow: its own documents, or Green Invoice. Never YPay, iCount, Yesh or Tranzila.
    fireEvent.click(screen.getByRole('radio', { name: 'By card online, through Grow' }));
    expect(screen.getByRole('radio', { name: 'Issued by Grow' })).toBeChecked();
    expect(otherServices()).toEqual([GREEN_INVOICE]);
    expect(screen.queryByRole('radio', { name: 'Issued by Yesh Invoice' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Issued by Tranzila' })).toBeNull();
  });

  it('does not offer iCount or Tranzila payments until they are finished', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    expect(screen.queryByRole('radio', { name: 'By card online, through iCount' })).toBeNull();
    expect(screen.queryByRole('radio', { name: /through Tranzila/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Issued by iCount' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'By card online, through Grow' })).toBeChecked();
  });

  it('drops an invoicing choice that no longer fits when the payment choice changes', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'Pay at the studio (cash, bank transfer or Bit)' }));
    fireEvent.click(screen.getByRole('radio', { name: 'I already use another invoicing service' }));
    fireEvent.click(screen.getByRole('radio', { name: YPAY }));
    // YPay documents cannot be issued for Grow card payments: back to Grow's own documents.
    fireEvent.click(screen.getByRole('radio', { name: 'By card online, through Grow' }));
    expect(screen.getByRole('radio', { name: 'Issued by Grow' })).toBeChecked();
  });

  it('YPay payments come with YPay documents, ready for the photographer', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'By card online, through YPay' }));
    expect(screen.getByRole('radio', { name: 'Issued by YPay' })).toBeChecked();
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
    expect(screen.getByRole('radio', { name: 'None (not a registered business)' })).toBeChecked();
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

  it("the platform owner's own email is explained in plain words", async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: { json: async () => ({ error: 'email_is_platform_owner' }) },
      }),
    });
    renderWizard();
    await fillStudioStep();
    next(); next(); next();
    expect(screen.getByText(/Use an email other than your OpalSwift platform account/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'me@opalswift.com' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("platform owner's account, which already manages every studio");
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
