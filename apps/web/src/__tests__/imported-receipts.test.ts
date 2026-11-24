import { describe, it, expect } from 'vitest';
import {
  guessClient,
  offlineMethodFromSheet,
  rowState,
  type ClientContact,
  type ImportedIncome,
} from '@/features/finance-admin/import/importedReceipts';
import {
  importedPaymentRow,
  offlineMethodFromSheet as edgeMethod,
  paidAtForIncomeDate,
  planImportedReceipt,
  SendImportedReceiptsSchema,
  type ImportedIncomeRow,
} from '../../../../supabase/functions/_shared/payments/imported-receipt.ts';
import { buildImportRows, guessColumns, type ImportSettings } from '@/features/finance-admin/import/importRows';

const SHEET_METHODS = ['cash', 'Cash', 'BIT', 'Bit / PayBox', 'bank transfer', 'Bank', 'העברה בנקאית', 'מזומן', 'ביט', 'AD', '', null, 'cheque'];

describe('method from the sheet', () => {
  it('reads cash, bank transfer and Bit, and leaves anything else to the studio', () => {
    expect(offlineMethodFromSheet('BIT')).toBe('bit');
    expect(offlineMethodFromSheet('bank transfer')).toBe('bank_transfer');
    expect(offlineMethodFromSheet('מזומן')).toBe('cash');
    expect(offlineMethodFromSheet('AD')).toBeNull();
    expect(offlineMethodFromSheet(null)).toBeNull();
  });

  it('the screen and the edge function read every method the same way', () => {
    for (const m of SHEET_METHODS) expect(offlineMethodFromSheet(m)).toBe(edgeMethod(m));
  });
});

const clients: ClientContact[] = [
  { id: 'c1', name: 'Kirzner F', email: 'k@example.test' },
  { id: 'c2', name: 'Levi', email: 'levi@example.test' },
  { id: 'c3', name: 'Levi B', email: 'levib@example.test' },
  { id: 'c4', name: 'Dana Cohen', email: 'dana@example.test' },
  { id: 'c5', name: 'No Email', email: null },
];

describe('guessClient', () => {
  it('matches the same name', () => {
    expect(guessClient({ payer_name: 'dana  cohen', job_name: null }, clients)?.id).toBe('c4');
  });
  it('matches a client named like the job', () => {
    expect(guessClient({ payer_name: 'Someone Else', job_name: 'Kirzner F' }, clients)?.id).toBe('c1');
  });
  it('matches the one client whose name starts with the payer surname', () => {
    expect(guessClient({ payer_name: 'Eli Kirzner', job_name: null }, clients)?.id).toBe('c1');
  });
  it('gives nothing when more than one client could fit', () => {
    expect(guessClient({ payer_name: 'Ron Levi', job_name: null }, clients)).toBeNull();
  });
  it('never suggests a client with no email', () => {
    expect(guessClient({ payer_name: 'No Email', job_name: null }, clients)).toBeNull();
  });
});

const base: ImportedIncomeRow = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 't1',
  income_date: '2026-03-04',
  amount_minor: 120000,
  payer_name: 'Dana Cohen',
  payer_email: null,
  payment_method: 'bank transfer',
  job_name: 'Cohen W',
  receipt_book: null,
  receipt_number: null,
  payment_id: null,
};

describe('planImportedReceipt', () => {
  it('sends with everything from the row and the email the studio typed', () => {
    expect(planImportedReceipt(base, 't1', { email: 'Dana@Example.test' })).toEqual({
      ok: true,
      email: 'dana@example.test',
      method: 'bank_transfer',
      name: 'Dana Cohen',
    });
  });
  it('never sends a row with an old receipt, one already sent, or another studio\'s row', () => {
    expect(planImportedReceipt({ ...base, receipt_number: '17' }, 't1', { email: 'a@b.co' })).toEqual({ ok: false, reason: 'has_old_receipt' });
    expect(planImportedReceipt({ ...base, payment_id: 'p1' }, 't1', { email: 'a@b.co' })).toEqual({ ok: false, reason: 'already_sent' });
    expect(planImportedReceipt(base, 't2', { email: 'a@b.co' })).toEqual({ ok: false, reason: 'not_found' });
  });
  it('asks for what the sheet lacks', () => {
    expect(planImportedReceipt(base, 't1', {})).toEqual({ ok: false, reason: 'no_email' });
    expect(planImportedReceipt({ ...base, payment_method: 'AD' }, 't1', { email: 'a@b.co' })).toEqual({ ok: false, reason: 'no_method' });
    expect(planImportedReceipt({ ...base, payment_method: 'AD' }, 't1', { email: 'a@b.co', method: 'cash' })).toMatchObject({ ok: true, method: 'cash' });
  });
});

describe('importedPaymentRow', () => {
  it('is a payment recorded by hand on the day the money arrived, one per row', () => {
    const row = importedPaymentRow({
      tenantId: 't1', personId: 'p1', accountId: null, row: base, name: 'Dana Cohen', method: 'bank_transfer', currency: 'ils', actorUserId: 'u1',
    });
    expect(row).toMatchObject({
      provider: 'manual',
      provider_payment_ref: `manual_import_${base.id}`,
      payment_method: 'bank_transfer',
      total_amount_minor: 120000,
      currency: 'ILS',
      status: 'succeeded',
      paid_at: '2026-03-04T12:00:00.000Z',
      document_name: 'Dana Cohen',
      description: 'Cohen W',
    });
    expect(paidAtForIncomeDate('2026-01-31')).toBe('2026-01-31T12:00:00.000Z');
  });
  it('takes at most 50 rows a request', () => {
    const rows = Array.from({ length: 51 }, () => ({ income_id: base.id }));
    expect(SendImportedReceiptsSchema.safeParse({ rows }).success).toBe(false);
    expect(SendImportedReceiptsSchema.safeParse({ rows: rows.slice(0, 50) }).success).toBe(true);
  });
});

describe('rowState', () => {
  const row = { ...base, payment: null } as unknown as ImportedIncome;
  it('tells sent, old receipt and open rows apart', () => {
    expect(rowState(row)).toBe('needs_receipt');
    expect(rowState({ ...row, payment_id: 'p' })).toBe('sent');
    expect(rowState({ ...row, receipt_book: 'A' })).toBe('old_receipt');
  });
});

describe('import keeps the payer email', () => {
  it('guesses the Email column and keeps a valid address on income rows only', () => {
    const headers = ['Date', 'Amount', 'Name', 'Email'];
    const columns = guessColumns(headers);
    expect(columns.map((c) => c.field)).toEqual(['date', 'amount', 'name', 'email']);
    const settings: ImportSettings = { sheetKind: 'income', columns, kindValues: {}, categoryChoices: {}, dayFirst: true };
    const built = buildImportRows(
      [headers, ['01/02/2026', '100', 'Dana', 'Dana@Example.test'], ['02/02/2026', '50', 'Ron', 'not an email']],
      0,
      settings,
      '2026-11-22',
    );
    expect(built.rows[0].email).toBe('dana@example.test');
    expect(built.rows[1].email).toBeUndefined();
  });
});
