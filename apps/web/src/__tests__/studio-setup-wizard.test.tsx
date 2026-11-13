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
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }) }));
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
const PAY_AT_STUDIO = "No card payments yet: I'll record payments myself";
const YPAY_PAY = 'By card online, through my own YPay account';
const YPAY = 'YPay: invoices and receipts for YPay card payments and cash';
const GREEN_INVOICE = 'Green Invoice: invoices and receipts for any payment';
const NO_DOCS = "None: I'll issue receipts myself";

/** Type step: how clients pay = "Per project" (no monthly fees). */
function projectFlow() {
  fireEvent.click(screen.getByRole('radio', { name: 'Per project' }));
}

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
  it('starts on YPay with YPay documents; Takbull shown greyed out as "Coming soon"; nothing else offered', async () => {
    renderWizard();
    expect(screen.getByLabelText('Main language')).toHaveValue('en');
    await fillStudioStep();
    next();
    const payRadios = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'ss-payment');
    expect(payRadios.map((r) => r.getAttribute('value'))).toEqual(['takbull', 'ypay', 'offline']);
    expect(screen.getByRole('radio', { name: /through Takbull/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /through Takbull/ })).toHaveAccessibleDescription('Coming soon');
    expect(screen.getByRole('radio', { name: YPAY_PAY })).toBeChecked();
    expect(screen.getByRole('radio', { name: YPAY })).toBeChecked();
    expect(screen.getByRole('radio', { name: NO_DOCS })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: PAY_AT_STUDIO })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    // Grow, Invoice4U and Green Invoice are not offered (owner decision 2026-11-10).
    expect(screen.queryByRole('button', { name: /different provider/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /through Grow|through Invoice4U/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'I already use another invoicing service' })).toBeNull();
    expect(screen.queryByRole('radio', { name: GREEN_INVOICE })).toBeNull();
    expect(screen.queryByRole('radio', { name: /mock/i })).not.toBeInTheDocument();
  });

  it('no "Will you charge monthly fees?" question: it follows how clients pay', async () => {
    renderWizard();
    await fillStudioStep();
    next();
    expect(screen.queryByText(/monthly fees\?/i)).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Yes, monthly fees/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^No, one-off payments only/ })).toBeNull();
  });

  it('documents follow the payment choice; pay at the studio may still use YPay documents', async () => {
    renderWizard();
    await fillStudioStep();
    projectFlow();
    next();
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    expect(screen.getByRole('radio', { name: NO_DOCS })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'I already use another invoicing service' }));
    const others = screen
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).name === 'ss-invoicing')
      .map((r) => r.closest('label')?.textContent?.trim());
    expect(others).toEqual([YPAY]);
    fireEvent.click(screen.getByRole('radio', { name: YPAY_PAY }));
    expect(screen.getByRole('radio', { name: YPAY })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Issued by Yesh Invoice' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Issued by Tranzila' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Issued by iCount' })).toBeNull();
  });

  it('monthly fees (dance studio): YPay stays, with a note', async () => {
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    next();
    expect(screen.getByRole('radio', { name: YPAY_PAY })).toBeChecked();
    expect(screen.getByText(/OpalSwift can't charge monthly fees through YPay yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    expect(screen.queryByText(/OpalSwift can't charge monthly fees through YPay yet/)).toBeNull();
    expect(
      screen.getByText('You can change your payment provider until your first payment. After that, changing it needs OpalSwift support.'),
    ).toBeInTheDocument();
  });

  it('per project (photographer): YPay by default with its limits, no monthly-fees note', async () => {
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Photograph/ }));
    next();
    expect(screen.getByRole('radio', { name: YPAY_PAY })).toBeChecked();
    expect(screen.queryByText(/can't charge monthly fees/)).toBeNull();
    expect(screen.getByText(/OpalSwift uses YPay documents only with YPay card payments/)).toBeInTheDocument();
  });

  it('colours: swatches first, own hex colours behind "Choose your own colour"; operators leave the logo to the owner', async () => {
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    next();
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    next();
    expect(screen.getByRole('group', { name: 'Pick a colour set' })).toBeInTheDocument();
    const own = screen.getByText('Choose your own colour');
    const details = own.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(screen.getByLabelText('Main colour'));
    expect(screen.getByText('The studio owner can add a logo later in Settings → Branding.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Logo (optional)')).toBeNull();
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
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    expect(screen.getByRole('radio', { name: NO_DOCS })).toBeChecked();
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
    expect(screen.getByRole('link', { name: "Open the studio's settings" })).toHaveAttribute('href', 'https://creativeballet.opalswift.com/admin');
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

  it('business email (clients see this): follows the owner email until changed, then is sent separately', async () => {
    h.invoke.mockResolvedValue({ data: { tenantId: 't-new', subdomain: 'creativeballet', owner: { status: 'invited' } }, error: null });
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    next();
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    next();
    next();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'owner@example.com' } });
    const business = screen.getByLabelText('Business email');
    expect(business).toHaveValue('owner@example.com');
    expect(screen.getByText(/You sign in with your login email: owner@example.com/)).toBeInTheDocument();
    // A typo is not accepted (it would fail the whole studio); the hint says what to do.
    fireEvent.change(business, { target: { value: 'hello@' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Enter a valid business email, or put back the login email.')).toBeInTheDocument();
    fireEvent.change(business, { target: { value: 'Hello@CreativeBallet.co.il' } });
    next();
    expect(screen.getByText('Hello@CreativeBallet.co.il')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    await screen.findByRole('heading', { name: 'Creative Ballet is ready' });
    expect(h.invoke).toHaveBeenCalledWith('provision-studio', {
      body: expect.objectContaining({
        ownerEmail: 'owner@example.com',
        contact: { email: 'hello@creativeballet.co.il' },
      }),
    });
  });

  it('business email left as the owner email: nothing extra is sent (the owner email stays the studio email)', async () => {
    h.invoke.mockResolvedValue({ data: { tenantId: 't-new', subdomain: 'creativeballet', owner: { status: 'invited' } }, error: null });
    renderWizard();
    await fillStudioStep();
    fireEvent.click(screen.getByRole('radio', { name: /Dance studio/ }));
    next();
    fireEvent.click(screen.getByRole('radio', { name: PAY_AT_STUDIO }));
    next();
    next();
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'owner@example.com' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    await screen.findByRole('heading', { name: 'Creative Ballet is ready' });
    expect(h.invoke.mock.calls[0][1].body.contact).toEqual({});
  });
});
