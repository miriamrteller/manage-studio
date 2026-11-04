/**
 * Record a payment, PR 4: one button, "Record a payment" / "רישום תשלום", in every flow where a
 * studio records money it was paid directly (first payment, monthly plan, admin enrol, project, booking,
 * and Finance -> Payments for anything else).
 * Run: pnpm -C apps/web test record-payment-everywhere.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from '../i18n/en.json';
import he from '../i18n/he.json';

const src = join(__dirname, '..');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

describe('"Record a payment" in every flow', () => {
  it('has one label in English and Hebrew', () => {
    expect(en.finance.record_payment.open).toBe('Record a payment');
    expect(he.finance.record_payment.open).toBe('רישום תשלום');
    expect(en.finance.record_payment.title).toBe('Record a payment');
    expect(he.finance.record_payment.title).toBe('רישום תשלום');
  });

  it.each([
    ['first payment (student)', 'features/students/components/StudentSlideOver.tsx', 'finance.record_payment.open'],
    ['monthly plan', 'features/finance/components/MonthlyPlanSection.tsx', 'finance.record_payment.open'],
    ['project payment', 'features/jobs/components/JobPaymentRequestRow.tsx', 'finance.record_payment.open'],
    ['admin enrol (paid at the studio)', 'features/enrolment/components/AdminEnrolmentPaymentStep.tsx', 'finance.record_payment.title'],
    ['project payment dialog', 'features/jobs/components/ManualPaymentDialog.tsx', 'finance.record_payment.title'],
    ['record dialog', 'features/finance/components/RecordPaymentModal.tsx', 'finance.record_payment.title'],
    ['booking (appointments)', 'pages/AdminAppointmentsPage.tsx', 'finance.record_payment.open'],
    ['Finance -> Payments', 'features/finance-admin/components/PaymentsLog.tsx', 'finance.record_payment.open'],
    ['Finance -> Payments form', 'features/finance/components/RecordAnyPaymentForm.tsx', 'finance.record_payment.title'],
  ])('%s uses it', (_flow, file, key) => {
    expect(read(file)).toContain(`'${key}'`);
  });
});
