// @vitest-environment jsdom
/**
 * Student panel → active monthly enrolment → Monthly plan (payments follow-up 5): shows what the
 * student pays, sets this student's amount or a one-off amount for a coming month through the
 * audited database functions, and records a monthly payment defaulting to the month's amount.
 * Fakes only.
 * Run: pnpm -C apps/web test monthly-plan-section.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc, invoke, plan } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  plan: {
    schedule: null as Record<string, unknown> | null,
    oneOffs: [] as Record<string, unknown>[],
  },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    functions: { invoke },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: table === 'billing_schedules' ? plan.schedule : null, error: null });
      chain.order = async () => ({ data: plan.oneOffs, error: null });
      return chain;
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-GB' } }),
}));

import { MonthlyPlanSection, comingMonths, monthAmountFor } from '../features/finance/components/MonthlyPlanSection';

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
  plan.schedule = null;
  plan.oneOffs = [];
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const section = () => (
  <MonthlyPlanSection engagementId="eng-1" classPriceMinor={35000} currency="ILS" paymentProvider="offline" onRecorded={vi.fn()} />
);

describe('helpers', () => {
  it('month amount: one-off, else the student, else the class price', () => {
    const base = { schedule: { id: 's', amount_minor: null, amount_note: null, next_billing_date: '2026-12-01', status: 'active' }, oneOffs: [] };
    expect(monthAmountFor(base, '2026-12', 35000)).toBe(35000);
    expect(monthAmountFor({ ...base, schedule: { ...base.schedule, amount_minor: 30000 } }, '2026-12', 35000)).toBe(30000);
    expect(monthAmountFor({ ...base, oneOffs: [{ period: '2026-12', amount_minor: 10000, note: 'x' }] }, '2026-12', 35000)).toBe(10000);
  });
  it('coming months start at the month that is due and roll over the year', () => {
    expect(comingMonths('2026-11-01', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});

describe('MonthlyPlanSection', () => {
  it("sets this student's amount with a reason", async () => {
    plan.schedule = { id: 's1', amount_minor: null, amount_note: null, next_billing_date: '2026-12-01', status: 'active' };
    rpc.mockResolvedValue({ data: {}, error: null });
    wrap(section());
    fireEvent.click(await screen.findByRole('button', { name: 'finance.monthly_plan.change_student' }));
    const amount = screen.getByLabelText('finance.record_payment.amount');
    expect(amount).toHaveValue('350');
    fireEvent.change(amount, { target: { value: '300' } });
    const save = screen.getByRole('button', { name: 'common.save' });
    expect(save).toBeDisabled(); // a reason is required
    fireEvent.change(screen.getByLabelText('finance.monthly_plan.reason'), { target: { value: 'Sibling' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_billing_schedule_amount', { p_engagement_id: 'eng-1', p_amount_minor: 30000, p_note: 'Sibling' }),
    );
  });

  it('sets a one-off amount for a chosen coming month', async () => {
    plan.schedule = { id: 's1', amount_minor: null, amount_note: null, next_billing_date: '2026-12-01', status: 'active' };
    rpc.mockResolvedValue({ data: {}, error: null });
    wrap(section());
    fireEvent.click(await screen.findByRole('button', { name: 'finance.monthly_plan.change_month' }));
    fireEvent.change(screen.getByLabelText('finance.monthly_plan.month'), { target: { value: '2027-01' } });
    fireEvent.change(screen.getByLabelText('finance.record_payment.amount'), { target: { value: '175' } });
    fireEvent.change(screen.getByLabelText('finance.monthly_plan.reason'), { target: { value: 'Holiday' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_billing_month_amount', {
        p_engagement_id: 'eng-1',
        p_period: '2027-01',
        p_amount_minor: 17500,
        p_note: 'Holiday',
      }),
    );
  });

  it('shows the student and one-off amounts, and records the due month at its amount', async () => {
    plan.schedule = { id: 's1', amount_minor: 30000, amount_note: 'Sibling', next_billing_date: '2026-12-01', status: 'active' };
    plan.oneOffs = [{ period: '2026-12', amount_minor: 10000, note: 'Two lessons' }];
    rpc.mockResolvedValue({ data: {}, error: null });
    wrap(section());
    expect(await screen.findByText(/Two lessons/)).toBeTruthy();
    expect(screen.getByText('Sibling')).toBeTruthy();

    // Recording the due month starts at its one-off amount.
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.monthly_open' }));
    expect(screen.getByLabelText(/finance.record_payment.amount/)).toHaveValue('100');
  });

  it('removes a one-off amount', async () => {
    plan.schedule = { id: 's1', amount_minor: null, amount_note: null, next_billing_date: '2026-12-01', status: 'active' };
    plan.oneOffs = [{ period: '2027-01', amount_minor: 17500, note: 'Holiday' }];
    rpc.mockResolvedValue({ data: {}, error: null });
    wrap(section());
    fireEvent.click(await screen.findByRole('button', { name: 'finance.monthly_plan.remove' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_billing_month_amount', {
        p_engagement_id: 'eng-1',
        p_period: '2027-01',
        p_amount_minor: null,
        p_note: null,
      }),
    );
  });

  it('a database refusal is explained', async () => {
    plan.schedule = { id: 's1', amount_minor: null, amount_note: null, next_billing_date: '2026-12-01', status: 'active' };
    rpc.mockResolvedValue({ data: null, error: { message: 'period_already_due' } });
    wrap(section());
    fireEvent.click(await screen.findByRole('button', { name: 'finance.monthly_plan.change_month' }));
    fireEvent.change(screen.getByLabelText('finance.monthly_plan.reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(await screen.findByText('finance.monthly_plan.error_period_already_due')).toBeTruthy();
  });
});
