// @vitest-environment jsdom
/**
 * Admin → Setup → Billing works on the real billing_accounts columns. It used to sort,
 * search and parse on account_holder_name / primary_contact_email / payment_method, which
 * are not columns, so the page failed for every studio, including the default card studio.
 * Card path covered here: the payer, business invoice details and the saved card show;
 * editing saves only billing-account fields. Pay-at-the-studio accounts show no card.
 * Run: pnpm -C apps/web test billing-accounts-page.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillingAccountSchema } from '@shared/schemas';
import {
  BILLING_ACCOUNT_SEARCH_SELECT,
  BILLING_ACCOUNT_SELECT,
  payerSearchFilter,
  toBillingAccountView,
} from '../features/billing/lib/billingAccountView';
import { BillingAccountService } from '../features/billing/service';
import { BillingAccountDetail } from '../features/billing/components/BillingAccountDetail';

const calls: Array<{ op: string; args: unknown[] }> = [];
let resultRows: unknown = [];
let cardRows: unknown = [];

vi.mock('@/lib/supabase', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'or', 'in', 'update']) {
      c[m] = (...args: unknown[]) => { calls.push({ op: m, args }); return c; };
    }
    c.range = async (...args: unknown[]) => {
      calls.push({ op: 'range', args });
      return { data: resultRows, error: null, count: Array.isArray(resultRows) ? resultRows.length : 0 };
    };
    c.single = async () => ({ data: Array.isArray(resultRows) ? resultRows[0] : resultRows, error: null });
    c.insert = async () => ({ error: null });
    return c;
  };
  return {
    supabase: {
      from: (table: string) => { calls.push({ op: 'from', args: [table] }); return chain(); },
      rpc: async (fn: string, args: unknown) => { calls.push({ op: 'rpc', args: [fn, args] }); return { data: cardRows, error: null }; },
      auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    },
  };
});
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', payment_provider: 'grow' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));

const tenant = { id: 't-1', name: 'Studio', subdomain: 'studio', language: 'he', country: 'IL', currency: 'ILS' } as never;

const cardRow = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  account_id: null,
  person_id: '33333333-3333-4333-8333-333333333333',
  business_name: 'Levi Dance Ltd',
  business_tax_id: '515555555',
  status: 'active',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  payer: { name: 'Dana Levi', email: 'dana@example.com' },
  household: null,
};

beforeEach(() => {
  calls.length = 0;
  resultRows = [cardRow];
  cardRows = [{ card_brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027, is_default: true }];
});
afterEach(() => cleanup());

describe('BillingAccountSchema matches the billing_accounts table', () => {
  it('parses a real row and no longer requires phantom columns', () => {
    expect(BillingAccountSchema.parse(cardRow).status).toBe('active');
    const view = toBillingAccountView(cardRow);
    expect(view).toMatchObject({ holderName: 'Dana Levi', holderEmail: 'dana@example.com' });
  });

  it('falls back to the household name, then the business name', () => {
    expect(toBillingAccountView({ ...cardRow, payer: null, household: { name: 'Levi family' } }).holderName).toBe('Levi family');
    expect(toBillingAccountView({ ...cardRow, payer: null }).holderName).toBe('Levi Dance Ltd');
  });

  it('searches the payer safely', () => {
    expect(payerSearchFilter('  dana ')).toBe('name.ilike.%dana%,email.ilike.%dana%');
    expect(payerSearchFilter('a,b(c)')).toBe('name.ilike.%a b c%,email.ilike.%a b c%');
    expect(payerSearchFilter('   ')).toBeNull();
  });
});

describe('BillingAccountService on real columns', () => {
  it('lists by real columns only and maps the payer', async () => {
    const result = await BillingAccountService.list(tenant, { statuses: ['active'] });
    expect(calls.find((c) => c.op === 'select')?.args[0]).toBe(BILLING_ACCOUNT_SELECT);
    const orderCols = calls.filter((c) => c.op === 'order').map((c) => c.args[0]);
    expect(orderCols).toEqual(['created_at']);
    expect(calls).toContainEqual({ op: 'in', args: ['status', ['active']] });
    expect(result.accounts[0].holderName).toBe('Dana Levi');
  });

  it('searches through the payer join', async () => {
    await BillingAccountService.list(tenant, { searchQuery: 'dana' });
    expect(calls.find((c) => c.op === 'select')?.args[0]).toBe(BILLING_ACCOUNT_SEARCH_SELECT);
    expect(calls).toContainEqual({
      op: 'or',
      args: ['name.ilike.%dana%,email.ilike.%dana%', { referencedTable: 'payer' }],
    });
  });

  it('card studio: the detail carries the saved card used for monthly charges', async () => {
    const account = await BillingAccountService.get(tenant, cardRow.id);
    expect(calls).toContainEqual({ op: 'rpc', args: ['get_billing_account_payment_method', { p_billing_account_id: cardRow.id }] });
    expect(account.savedCard).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 });
  });

  it('pay-at-the-studio account: no saved card', async () => {
    cardRows = [];
    const account = await BillingAccountService.get(tenant, cardRow.id);
    expect(account.savedCard).toBeNull();
  });

  it('update writes only billing-account fields, blanks become NULL', async () => {
    await BillingAccountService.update(tenant, cardRow.id, { business_name: '  ', business_tax_id: ' 515555555 ', status: 'archived' });
    expect(calls).toContainEqual({
      op: 'update',
      args: [{ business_name: null, business_tax_id: '515555555', status: 'archived' }],
    });
  });
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('BillingAccountDetail (card studio)', () => {
  it('shows the payer, business details and the saved card', async () => {
    wrap(<BillingAccountDetail id={cardRow.id} />);
    expect(await screen.findByRole('heading', { name: 'Dana Levi' })).toBeInTheDocument();
    expect(screen.getByTestId('billing-saved-card')).toHaveTextContent('Visa •••• 4242 (12/27)');
    expect(screen.getByText('Levi Dance Ltd')).toBeInTheDocument();
  });

  it('edits the business invoice details', async () => {
    wrap(<BillingAccountDetail id={cardRow.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'common.edit' }));
    fireEvent.change(screen.getByLabelText('pages.billing.business_name_label'), { target: { value: 'Levi Studio Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        op: 'update',
        args: [{ business_name: 'Levi Studio Ltd', business_tax_id: '515555555', status: 'active' }],
      }),
    );
  });
});
