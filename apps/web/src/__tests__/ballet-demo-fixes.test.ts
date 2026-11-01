// @vitest-environment jsdom
/**
 * Fixes from the ballet demo: Hebrew step counter, localised day names,
 * health-declaration wording, and refreshing lists after an offline payment.
 * Run: pnpm -C apps/web test ballet-demo-fixes.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import i18n from '@/i18n/i18n';
import { shortWeekdayName } from '@/lib/weekdayName';
import { invalidateAfterOfflinePayment, offlinePaymentQueryKeys } from '@/features/students/lib/offlinePaymentCaches';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('step counter', () => {
  it('is translated in both languages', async () => {
    expect(i18n.t('enrolment.step_counter', { current: 3, total: 4 })).toBe('Step 3 of 4');
    await i18n.changeLanguage('he');
    expect(i18n.t('enrolment.step_counter', { current: 3, total: 4 })).toBe('שלב 3 מתוך 4');
  });

  it('the stepper no longer hard-codes "of"', () => {
    const src = readFileSync(resolve(__dirname, '../features/enrolment/components/EnrolmentStepper.tsx'), 'utf8');
    expect(src).not.toMatch(/\} of \{/);
  });
});

describe('day names', () => {
  it('are in the page language', () => {
    expect(shortWeekdayName(0, 'en')).toBe('Sun');
    expect(shortWeekdayName(6, 'en')).toBe('Sat');
    expect(shortWeekdayName(0, 'he')).toMatch(/א/);
    expect(shortWeekdayName(0, 'he')).not.toBe('Sun');
    expect(shortWeekdayName(7, 'en')).toBe('');
  });

  it('no hard-coded English day list is left in the enrolment and portal screens', () => {
    for (const file of ['../features/enrolment/components/StepClass.tsx', '../components/Dashboard/EnrolmentRow.tsx']) {
      expect(readFileSync(resolve(__dirname, file), 'utf8')).not.toMatch(/'Sun', 'Mon'/);
    }
  });
});

describe('health declaration wording (docs/legal/07b)', () => {
  it('the Hebrew enrolment step never calls it a waiver; dance says health declaration', () => {
    const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, f), 'utf8')).enrolment as Record<string, string>;
    const base = read('../i18n/he.json');
    const dance = read('../i18n/verticals/dance.he.json');
    const keys = [
      'step_waiver',
      'waiver_document_region',
      'waiver_checkbox_label',
      'waiver_token_expired',
      'waiver_already_signed',
      'waiver_loading',
      'waiver_guardian_confirm',
      'waiver_minor_cannot_sign_body',
    ];
    for (const key of keys) {
      expect(base[key], key).not.toMatch(/ויתור/);
      expect(base[key], key).toMatch(/טופס/);
      expect(dance[key], key).toMatch(/הצהרת (ה)?בריאות/);
    }
  });
});

describe('recording an offline payment', () => {
  it('refreshes the student panel, the Students list and Finance', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateAfterOfflinePayment(queryClient, 't-1', 'p-1');
    const keys = spy.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(offlinePaymentQueryKeys('t-1', 'p-1'));
    expect(keys).toEqual(
      expect.arrayContaining([
        ['student-detail-payments', 't-1', 'p-1'],
        ['students', 't-1'],
        ['students-list-enrolments', 't-1'],
        ['finance-summary', 't-1'],
        ['outstanding-engagements', 't-1'],
        ['payments-log', 't-1'],
      ]),
    );
  });

  it('the keys match the queries the Students list and Finance pages use', () => {
    const read = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    expect(read('../features/finance-admin/hooks/useFinanceSummary.ts')).toMatch(/\['finance-summary', tenant\?\.id/);
    expect(read('../features/finance-admin/hooks/useFinanceSummary.ts')).toMatch(/\['outstanding-engagements', tenant\?\.id/);
    expect(read('../features/finance-admin/hooks/usePaymentsLog.ts')).toMatch(/\['payments-log', tenant\?\.id/);
    expect(read('../features/students/components/StudentsList.tsx')).toMatch(/\['students-list-enrolments', tenant\?\.id/);
  });
});
