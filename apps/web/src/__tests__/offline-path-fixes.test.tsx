// @vitest-environment jsdom
/**
 * Pay-at-the-studio launch bugs (found while building the ballet demo):
 * 1. finishing with "Pay at the studio" must clear the stored enrolment intent, or
 *    "Go to my account" bounces the parent back to step 1 of /enrol;
 * 2. the parent portal must refetch so the new place shows at once;
 * 3. a student's billing account must parse from the real billing_accounts columns;
 * 4. the monthly hint must not say "charged every month" when the studio is paid in person.
 * Card-paying studios are unchanged.
 * Run: pnpm -C apps/web test offline-path-fixes.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OfflinePaymentNotice } from '../features/enrolment/components/OfflinePaymentNotice';
import { monthlyHintKey } from '../features/enrolment/lib/monthlyHint';
import { parseStudentBillingAccount } from '../features/students/lib/studentBillingAccount';

const { invalidateQueries } = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

afterEach(() => {
  cleanup();
  invalidateQueries.mockReset();
  sessionStorage.clear();
});

describe('1 + 2: finishing with "Pay at the studio"', () => {
  it('clears the stored enrolment intent so /dashboard does not send the parent back to /enrol', () => {
    sessionStorage.setItem('enrollmentIntent', JSON.stringify({ classId: 'c-1', seasonId: 's-1' }));
    render(<MemoryRouter><OfflinePaymentNotice /></MemoryRouter>);
    expect(sessionStorage.getItem('enrollmentIntent')).toBeNull();
  });

  it('refreshes the parent portal so the new place shows at once', () => {
    render(<MemoryRouter><OfflinePaymentNotice /></MemoryRouter>);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['parent-portal'] });
  });
});

describe('3: student billing account', () => {
  const realRow = {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    person_id: '33333333-3333-4333-8333-333333333333',
    account_id: null,
    business_name: null,
    business_tax_id: null,
    status: 'active',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    payer: { name: 'Dana Levi', email: 'dana@example.com' },
  };

  it('parses a real billing_accounts row (no account_holder_name / payment_method columns)', () => {
    expect(parseStudentBillingAccount(realRow)).toEqual({
      id: realRow.id,
      status: 'active',
      holderName: 'Dana Levi',
      holderEmail: 'dana@example.com',
      businessName: null,
    });
  });

  it('falls back to the business name and tolerates a missing payer', () => {
    expect(
      parseStudentBillingAccount({ ...realRow, payer: null, business_name: 'Levi Ltd' }),
    ).toMatchObject({ holderName: 'Levi Ltd', holderEmail: null });
  });

  it('returns null for a row that is not a billing account', () => {
    expect(parseStudentBillingAccount({ id: 'x' })).toBeNull();
  });
});

describe('4: monthly hint', () => {
  it('says "paid at the studio" for pay-at-the-studio studios', () => {
    expect(monthlyHintKey('offline')).toBe('enrolment.offline_monthly_hint');
  });
  it('keeps the card wording for every other provider', () => {
    for (const p of ['grow', 'ypay', 'icount', null, undefined]) {
      expect(monthlyHintKey(p)).toBe('enrolment.checkout_monthly_hint');
    }
  });
});
