// @vitest-environment jsdom
/**
 * Payment provider choice (payments follow-up 4, owner decisions):
 *  - "Will you charge monthly fees?" decides what is offered; YPay / Invoice4U sit behind
 *    "Different provider?" and only without monthly fees;
 *  - a studio may change provider freely until its first payment (the database guard is tested
 *    in supabase/tests/provider-switch), then it is locked as before;
 *  - backstop: a YPay / Invoice4U studio cannot make a class monthly.
 * Fakes only.
 * Run: pnpm -C apps/web test provider-choice.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { update, paymentsCount, tenantState } = vi.hoisted(() => ({
  update: vi.fn(),
  paymentsCount: { value: 0 as number | null },
  tenantState: {} as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'payments') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: async () => ({ count: paymentsCount.value, error: null }),
        };
        return chain;
      }
      return { update: (p: unknown) => { update(p); return { eq: async () => ({ error: null }) }; } };
    },
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

import {
  canChoosePaymentProvider,
  isMonthlyFeesNeedGrowError,
  monthlyFeesDefaultFor,
  monthlyFeesSupported,
  paymentProviderSwitchAllowed,
} from '@/lib/providerPairing';
import { providerForMonthlyAnswer } from '../features/settings/components/PaymentProviderChoice';
import { OfflinePaymentsSettingsForm } from '../features/settings/components/OfflinePaymentsSettingsForm';
import { bundledProviderChoices } from '../features/settings/components/BundledPaymentsSettings';
import { ClassForm } from '../features/classes/components/ClassForm';

afterEach(() => {
  cleanup();
  update.mockReset();
  paymentsCount.value = 0;
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('rules', () => {
  it('switching is free before the first payment, strict after it (unknown = after)', () => {
    const grow = { payment: 'grow', invoicing: 'grow' };
    expect(paymentProviderSwitchAllowed(grow, { payment: 'ypay' }, false)).toBe(true);
    expect(paymentProviderSwitchAllowed(grow, { payment: 'offline' }, false)).toBe(true);
    expect(paymentProviderSwitchAllowed(grow, { payment: 'icount' }, false)).toBe(false);
    expect(paymentProviderSwitchAllowed(grow, { payment: 'ypay' }, true)).toBe(false);
    expect(paymentProviderSwitchAllowed(grow, { payment: 'ypay' })).toBe(false);
    // Pay at the studio → online stays open after payments (Creative Ballet adding Grow).
    expect(paymentProviderSwitchAllowed({ payment: 'offline', invoicing: 'none' }, { payment: 'grow' }, true)).toBe(true);

    expect(canChoosePaymentProvider({ payment_provider: 'ypay', invoicing_provider: 'ypay' }, false)).toBe(true);
    expect(canChoosePaymentProvider({ payment_provider: 'ypay', invoicing_provider: 'ypay' }, true)).toBe(false);
    expect(canChoosePaymentProvider({ payment_provider: 'ypay', invoicing_provider: 'ypay' }, undefined)).toBe(false);
    expect(canChoosePaymentProvider({ payment_provider: 'icount', invoicing_provider: 'icount' }, false)).toBe(false);
  });

  it('"monthly fees?" is pre-filled by studio type, and decides the providers', () => {
    expect(monthlyFeesDefaultFor('dance-studio')).toBe(true);
    expect(monthlyFeesDefaultFor('photographer')).toBe(false);
    expect(monthlyFeesDefaultFor('beautician')).toBe(false);
    expect(monthlyFeesDefaultFor('generic')).toBeNull();
    expect(providerForMonthlyAnswer(true, 'ypay')).toBe('ypay');
    expect(providerForMonthlyAnswer(true, 'invoice4u')).toBe('ypay');
    expect(providerForMonthlyAnswer(true, 'grow')).toBe('grow');
    expect(providerForMonthlyAnswer(true, 'offline')).toBe('offline');
    expect(providerForMonthlyAnswer(false, 'ypay')).toBe('ypay');
    expect(monthlyFeesSupported('grow')).toBe(true);
    expect(monthlyFeesSupported('offline')).toBe(true);
    expect(monthlyFeesSupported('ypay')).toBe(false);
    expect(monthlyFeesSupported('invoice4u')).toBe(false);
    expect(isMonthlyFeesNeedGrowError({ message: 'monthly_fees_need_grow' })).toBe(true);
  });

  it('bundled page: a studio keeps only its own provider; no new one is offered', () => {
    const grow = { payment_provider: 'grow', invoicing_provider: 'grow' };
    expect(bundledProviderChoices(grow, false)).toEqual(['grow']);
    expect(bundledProviderChoices(grow, true)).toEqual(['grow']);
    expect(bundledProviderChoices(grow, undefined)).toEqual(['grow']);
    expect(bundledProviderChoices({ payment_provider: 'ypay', invoicing_provider: 'ypay' }, false)).toEqual([]);
    expect(bundledProviderChoices({ payment_provider: 'icount', invoicing_provider: 'icount' }, false)).toEqual(['icount']);
  });
});

describe('Settings → How customers pay', () => {
  it('a Grow studio with no payment yet may still change provider (no "monthly fees?" question)', async () => {
    Object.assign(tenantState, {
      payment_provider: 'grow', invoicing_provider: 'none', vertical: 'photographer',
      profile: { paymentFlow: 'project' },
    });
    paymentsCount.value = 0;
    wrap(<OfflinePaymentsSettingsForm />);
    // Locked until we know there is no payment, then the choice opens.
    expect(await screen.findByRole('radio', { name: 'studio_setup.payment_grow' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'payment_choice.monthly_no' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'payment_choice.monthly_yes' })).toBeNull();
    // YPay is shown up front; Grow stays shown because it is the saved choice.
    expect(screen.queryByRole('button', { name: 'payment_choice.different_provider' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'studio_setup.payment_ypay' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ payment_provider: 'ypay' })));
  });

  it('after its first payment the choice is locked with "contact OpalSwift support"', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'grow' });
    paymentsCount.value = 3;
    wrap(<OfflinePaymentsSettingsForm />);
    await waitFor(() => expect(screen.getByText('settings.offline_payments.switch_contact_support')).toBeTruthy());
    expect(screen.queryByRole('radio', { name: 'payment_choice.monthly_yes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull();
  });
});

describe('backstop: monthly classes need Grow', () => {
  it('a YPay studio is not offered a monthly class (no dead-end option, no note)', () => {
    Object.assign(tenantState, { payment_provider: 'ypay', currency: 'ILS' });
    wrap(<ClassForm terms={[]} levels={[]} teachers={[]} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('option', { name: 'billing.monthly' })).toBeNull();
    expect(screen.queryByText('payment_choice.monthly_needs_grow')).toBeNull();
    expect((screen.getByLabelText('form.class.billing_frequency') as HTMLSelectElement).value).toBe('one_time');
  });

  it('a monthly class a YPay studio already has keeps its Monthly option', () => {
    Object.assign(tenantState, { payment_provider: 'ypay', currency: 'ILS' });
    wrap(
      <ClassForm
        classItem={{ id: 'c-1', name: 'Ballet', billing_mode: 'recurring' } as never}
        terms={[]}
        levels={[]}
        teachers={[]}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('option', { name: 'billing.monthly' })).toBeInTheDocument();
    expect((screen.getByLabelText('form.class.billing_frequency') as HTMLSelectElement).value).toBe('recurring');
  });

  it('a Grow studio keeps monthly classes, the default', () => {
    Object.assign(tenantState, { payment_provider: 'grow', currency: 'ILS' });
    wrap(<ClassForm terms={[]} levels={[]} teachers={[]} onSubmit={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'billing.monthly' })).toBeInTheDocument();
    expect((screen.getByLabelText('form.class.billing_frequency') as HTMLSelectElement).value).toBe('recurring');
    expect(screen.queryByText('payment_choice.monthly_needs_grow')).toBeNull();
  });
});

describe('"Needs a signed form" on a class', () => {
  it('new classes need a form; an admin can choose No, and the choice is saved', async () => {
    Object.assign(tenantState, { payment_provider: 'offline', currency: 'ILS' });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const term = { id: '11111111-1111-4111-8111-111111111111', name: 'Ongoing', status: 'active', start_date: '2026-01-01' };
    wrap(<ClassForm terms={[term] as never} levels={[]} teachers={[]} onSubmit={onSubmit} />);
    const select = screen.getByLabelText('form.class.waiver_required') as HTMLSelectElement;
    expect(select.value).toBe('true');
    expect(screen.getByText('form.class.waiver_required_help')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/form.class.name/), { target: { value: 'Studio plan' } });
    fireEvent.change(select, { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ waiver_required: false, name: 'Studio plan' });
  });

  it('an existing class keeps its own setting', () => {
    Object.assign(tenantState, { payment_provider: 'offline', currency: 'ILS' });
    wrap(<ClassForm classItem={{ id: 'c1', name: 'Plan', waiver_required: false }} terms={[]} levels={[]} teachers={[]} onSubmit={vi.fn()} />);
    expect((screen.getByLabelText('form.class.waiver_required') as HTMLSelectElement).value).toBe('false');
  });
});
