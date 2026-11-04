/**
 * Accountant export, PR2: period presets (VAT period prefilled), paging with no row cap,
 * and the CSV an accountant gets (document, VAT from the document issued, refunds).
 * Run: pnpm -C apps/web test accountant-export.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '@/i18n/i18n';
import type { PaymentLogRow } from '@shared/schemas';
import { accountantPeriodRange, parseVatReportPeriod } from '@/features/finance-admin/lib/periods';
import { fetchAllPages } from '@/features/finance-admin/lib/pagedFetch';
import {
  buildAccountantCsv,
  formatIsraeliDate,
  formatMinorAmount,
} from '@/features/finance-admin/lib/accountantExport';
import { CSV_BOM } from '@/features/finance-admin/lib/financeAdminUtils';

// 2026-11-04 noon in Israel.
const NOV = new Date('2026-11-04T10:00:00Z');
const JAN = new Date('2026-01-15T10:00:00Z');

describe('accountantPeriodRange', () => {
  it('bi-monthly VAT periods: Sep–Oct is the last one in November', () => {
    expect(accountantPeriodRange('vat_previous', 'bi_monthly', NOV)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-10-31',
    });
    expect(accountantPeriodRange('vat_current', 'bi_monthly', NOV)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-12-31',
    });
  });

  it('crosses the year: in January the last VAT period is Nov–Dec of last year', () => {
    expect(accountantPeriodRange('vat_previous', 'bi_monthly', JAN)).toEqual({
      startDate: '2025-11-01',
      endDate: '2025-12-31',
    });
    expect(accountantPeriodRange('vat_previous', 'monthly', JAN)).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    });
  });

  it('months, quarter and years', () => {
    expect(accountantPeriodRange('month_previous', 'bi_monthly', NOV)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(accountantPeriodRange('quarter_previous', 'bi_monthly', NOV)).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-09-30',
    });
    expect(accountantPeriodRange('quarter_previous', 'bi_monthly', JAN)).toEqual({
      startDate: '2025-10-01',
      endDate: '2025-12-31',
    });
    expect(accountantPeriodRange('year_previous', 'monthly', NOV)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    expect(accountantPeriodRange('year_current', 'monthly', NOV).endDate).toBe('2026-12-31');
  });

  it('VAT setting defaults to every 2 months', () => {
    expect(parseVatReportPeriod(undefined)).toBe('bi_monthly');
    expect(parseVatReportPeriod('monthly')).toBe('monthly');
  });
});

describe('fetchAllPages', () => {
  it('pages until everything is fetched, past the old 5,000 cap', async () => {
    const total = 7_250;
    const calls: number[] = [];
    const rows = await fetchAllPages(async (page, pageSize) => {
      calls.push(page);
      const start = (page - 1) * pageSize;
      const count = Math.max(0, Math.min(pageSize, total - start));
      return { rows: Array.from({ length: count }, (_, i) => start + i), totalCount: total };
    });
    expect(rows).toHaveLength(total);
    expect(rows[total - 1]).toBe(total - 1);
    expect(calls).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('stops on an empty first page', async () => {
    expect(await fetchAllPages(async () => ({ rows: [], totalCount: 0 }))).toEqual([]);
  });
});

describe('formatting', () => {
  it('amounts in shekels and Israeli dates', () => {
    expect(formatMinorAmount(11800)).toBe('118.00');
    expect(formatMinorAmount(-505)).toBe('-5.05');
    expect(formatMinorAmount(null)).toBe('');
    // 23:30 UTC on 31 Oct is already 1 Nov in Israel.
    expect(formatIsraeliDate('2026-10-31T23:30:00Z')).toBe('01/11/2026');
  });
});

function row(over: Partial<PaymentLogRow>): PaymentLogRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    person_id: '00000000-0000-0000-0000-0000000000p1'.replace('p', 'a'),
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: 11800,
    currency: 'ILS',
    status: 'succeeded',
    charge_type: 'initial',
    provider: 'ypay',
    payment_method: 'card',
    paid_at: '2026-09-10T08:00:00Z',
    created_at: '2026-09-10T08:00:00Z',
    external_document_id: 'd1',
    external_document_number: '1001',
    invoice_url: 'https://docs/1001.pdf',
    invoice_issued_at: '2026-09-10T08:01:00Z',
    issued_document_kind: 'tax_invoice_receipt',
    allocation_number: null,
    refunds_payment_id: null,
    document_queue: [],
    person: { id: 'p1', name: 'Dana Levi' },
    offering: { id: 'o1', name: 'Ballet 6–8' },
    ...over,
  } as PaymentLogRow;
}

function parse(csv: string): string[][] {
  expect(csv.startsWith(CSV_BOM)).toBe(true);
  return csv
    .slice(1)
    .split('\r\n')
    .map((line) => line.split(','));
}

describe('buildAccountantCsv', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('one row per payment with document, VAT split and refund link', () => {
    const sale = row({});
    const receipt = row({
      id: '00000000-0000-0000-0000-000000000002',
      total_amount_minor: 5000,
      provider: 'manual',
      payment_method: 'cash',
      issued_document_kind: 'receipt',
      external_document_number: '7',
    });
    const refund = row({
      id: '00000000-0000-0000-0000-000000000003',
      charge_type: 'refund',
      total_amount_minor: -11800,
      issued_document_kind: null,
      external_document_id: null,
      external_document_number: null,
      invoice_url: null,
      refunds_payment_id: sale.id,
    });
    const lines = parse(
      buildAccountantCsv([sale, receipt, refund], { tenant: { invoicing_provider: 'ypay' }, t: i18n.t }),
    );
    const header = lines[0];
    const col = (name: string) => header.indexOf(name);

    expect(header).toContain('Document type');
    expect(lines).toHaveLength(4);

    const [s, r, f] = lines.slice(1);
    expect(s[col('Paid date')]).toBe('10/09/2026');
    expect(s[col('Document type')]).toBe('Tax invoice-receipt');
    expect(s[col('Document number')]).toBe('1001');
    expect(s[col('Document link')]).toBe('https://docs/1001.pdf');
    expect(s[col('Before VAT')]).toBe('100.00');
    expect(s[col('VAT')]).toBe('18.00');
    expect(s[col('VAT rate')]).toBe('18%');
    expect(s[col('Total')]).toBe('118.00');

    expect(r[col('Document type')]).toBe('Receipt');
    expect(r[col('VAT')]).toBe('0.00');
    expect(r[col('Total')]).toBe('50.00');

    expect(f[col('Total')]).toBe('-118.00');
    expect(f[col('Document type')]).toBe('');
    expect(f[col('No document because')]).toBe('Refund document made in YPay');
    expect(f[col('Refund of document')]).toBe('1001');
    expect(f[col('VAT')]).toBe('');
  });

  it('unknown document type: gross only, "document issued by <provider>"', () => {
    const lines = parse(
      buildAccountantCsv([row({ provider: 'grow', issued_document_kind: null })], {
        tenant: { invoicing_provider: 'grow' },
        t: i18n.t,
      }),
    );
    const header = lines[0];
    const r = lines[1];
    expect(r[header.indexOf('Document type')]).toBe('Document issued by Grow');
    expect(r[header.indexOf('Before VAT')]).toBe('');
    expect(r[header.indexOf('Total')]).toBe('118.00');
  });

  it('refund of an original outside the period uses the looked-up number', () => {
    const refund = row({ charge_type: 'refund', total_amount_minor: -100, refunds_payment_id: 'orig' });
    const lines = parse(
      buildAccountantCsv([refund], {
        tenant: { invoicing_provider: 'ypay' },
        originalDocumentNumbers: new Map([['orig', '900']]),
        t: i18n.t,
      }),
    );
    expect(lines[1][lines[0].indexOf('Refund of document')]).toBe('900');
  });

  it('Hebrew headers for Hebrew studios', async () => {
    await i18n.changeLanguage('he');
    const csv = buildAccountantCsv([row({})], { tenant: { invoicing_provider: 'ypay' }, t: i18n.t });
    expect(csv).toContain('חשבונית מס-קבלה');
    expect(csv).toContain('מספר מסמך');
    await i18n.changeLanguage('en');
  });
});

describe('CSV language (owner request: English or Hebrew)', () => {
  it('the same rows in Hebrew and English: labels change, dates and amounts do not', async () => {
    const { csvT } = await import('@/features/finance-admin/lib/csvLanguage');
    const rows = [row({ total_amount_minor: 11800, payment_method: 'cash' })];
    const he = buildAccountantCsv(rows, { tenant: { invoicing_provider: 'ypay' }, t: csvT(i18n, 'he') });
    const en = buildAccountantCsv(rows, { tenant: { invoicing_provider: 'ypay' }, t: csvT(i18n, 'en') });
    expect(he).toContain('סוג מסמך');
    expect(he).toContain('חשבונית מס-קבלה');
    expect(he).toContain('מזומן');
    expect(en).toContain('Document type');
    expect(en).toContain('Tax invoice-receipt');
    expect(en).toContain('Cash');
    for (const csv of [he, en]) {
      expect(csv).toContain('10/09/2026');
      expect(csv).toContain('118.00');
      expect(csv).toContain('18.00');
    }
  });

  it('payments and expenses CSVs follow the chosen language too', async () => {
    const { csvT } = await import('@/features/finance-admin/lib/csvLanguage');
    const { buildPaymentsCsv, buildExpensesCsv } = await import('@/features/finance-admin/lib/csvExport');
    const payments = [row({ total_amount_minor: 5000, payment_method: 'bank_transfer' })];
    expect(buildPaymentsCsv(payments, csvT(i18n, 'he'))).toContain('העברה בנקאית');
    expect(buildPaymentsCsv(payments, csvT(i18n, 'en'))).toContain('Bank transfer');
    expect(buildPaymentsCsv(payments, csvT(i18n, 'en'))).toContain('50.00');

    const expense = {
      id: 'e1',
      tenant_id: 't1',
      expense_date: '2026-10-05',
      description: 'Rent',
      pretax_amount_minor: 10000,
      vat_amount_minor: 1800,
      total_amount_minor: 11800,
      currency: 'ILS',
      category: { name: 'Rent' },
    } as never;
    const heExp = buildExpensesCsv([expense], csvT(i18n, 'he'));
    const enExp = buildExpensesCsv([expense], csvT(i18n, 'en'));
    expect(heExp).toContain('תאריך הוצאה');
    expect(enExp).toContain('Expense date');
    for (const csv of [heExp, enExp]) {
      expect(csv).toContain('05/10/2026');
      expect(csv).toContain('118.00');
    }
  });

  it('prefills from the app language', async () => {
    const { csvLanguageFromApp } = await import('@/features/finance-admin/lib/csvLanguage');
    expect(csvLanguageFromApp('he')).toBe('he');
    expect(csvLanguageFromApp('he-IL')).toBe('he');
    expect(csvLanguageFromApp('en')).toBe('en');
    expect(csvLanguageFromApp(undefined)).toBe('en');
  });
});
