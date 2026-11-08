import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  buildImportRows,
  findHeaderRow,
  guessColumns,
  guessKindValue,
  guessSheetKind,
  headerNames,
  parseAmount,
  parseCurrency,
  parseDate,
  parseMonth,
  type ImportSettings,
} from '@/features/finance-admin/import/importRows';
import { decodeText, parseCsv, readXlsx } from '@/features/finance-admin/import/readSpreadsheet';

const ENTRIES_HEADERS = [
  'Year', 'Month', 'Income or Expense', 'Date', 'Hashkafa', 'Type of Job', 'Job Name', 'Recipient Name',
  'Payment Method', 'Type', 'USD or NIS', 'Numeric Value', 'NIS equivalent', 'NIS/USD rate', 'Notes',
];
const RECEIPTS_HEADERS = [
  'Receipt Book', 'Receipt Number', 'Date', 'Customer', 'NIS Total', 'Notes', 'Month', 'Gross Income', 'Net Income', 'Notes',
];

describe('finance import: column guesses', () => {
  it('matches the entries ledger columns', () => {
    const cols = guessColumns(headerNames(ENTRIES_HEADERS, ENTRIES_HEADERS.length));
    const field = (h: string) => cols.find((c) => c.header === h)?.field;
    expect(field('Year')).toBe('year');
    expect(field('Month')).toBe('month');
    expect(field('Income or Expense')).toBe('kind');
    expect(field('Date')).toBe('date');
    expect(field('Hashkafa')).toBe('extra');
    expect(field('Type of Job')).toBe('extra');
    expect(field('Job Name')).toBe('job_name');
    expect(field('Recipient Name')).toBe('name');
    expect(field('Payment Method')).toBe('payment_method');
    expect(field('Type')).toBe('category');
    expect(field('USD or NIS')).toBe('currency');
    expect(field('Numeric Value')).toBe('original_amount');
    expect(field('NIS equivalent')).toBe('amount');
    expect(field('NIS/USD rate')).toBe('exchange_rate');
    expect(field('Notes')).toBe('description');
    expect(guessSheetKind(cols)).toBe('mixed');
  });

  it('matches the receipts columns and keeps the second Notes column', () => {
    const headers = headerNames(RECEIPTS_HEADERS, RECEIPTS_HEADERS.length);
    expect(headers[9]).toBe('Notes 2');
    const cols = guessColumns(headers);
    const field = (h: string) => cols.find((c) => c.header === h)?.field;
    expect(field('Receipt Book')).toBe('receipt_book');
    expect(field('Receipt Number')).toBe('receipt_number');
    expect(field('Customer')).toBe('name');
    expect(field('NIS Total')).toBe('amount');
    expect(field('Notes')).toBe('description');
    expect(field('Notes 2')).toBe('extra');
    expect(field('Gross Income')).toBe('extra');
    expect(guessSheetKind(cols)).toBe('receipts');
  });

  it('reads Hebrew headers', () => {
    const cols = guessColumns(['תאריך', 'סכום', 'קטגוריה', 'ספק', 'הערות', 'משהו אחר']);
    expect(cols.map((c) => c.field)).toEqual(['date', 'amount', 'category', 'name', 'description', 'extra']);
    expect(guessKindValue('הכנסה')).toBe('income');
    expect(guessKindValue('Expense')).toBe('expense');
    expect(guessKindValue('Transfer')).toBe('skip');
  });

  it('finds the header row below a title', () => {
    expect(findHeaderRow([['My studio 2025'], [], ['Date', 'Amount']])).toBe(2);
  });
});

describe('finance import: values', () => {
  it('reads amounts in common formats', () => {
    expect(parseAmount('₪1,234.50')).toBe(1234.5);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('(120)')).toBe(-120);
    expect(parseAmount('120-')).toBe(-120);
    expect(parseAmount('350 ש"ח')).toBe(350);
    expect(parseAmount(99)).toBe(99);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('reads dates day-first unless told otherwise', () => {
    expect(parseDate('03/04/2025')).toBe('2025-04-03');
    expect(parseDate('03/04/2025', false)).toBe('2025-03-04');
    expect(parseDate('25/12/24', false)).toBe('2024-12-25');
    expect(parseDate('2025-03-04')).toBe('2025-03-04');
    expect(parseDate('4.3.2025')).toBe('2025-03-04');
    expect(parseDate(45720)).toBe('2025-03-04');
    expect(parseDate('31/02/2025')).toBeNull();
    expect(parseDate('soon')).toBeNull();
  });

  it('reads currencies and months', () => {
    expect(parseCurrency('USD')).toBe('USD');
    expect(parseCurrency('NIS')).toBe('ILS');
    expect(parseCurrency('₪')).toBe('ILS');
    expect(parseCurrency('דולר')).toBe('USD');
    expect(parseMonth('March')).toBe(3);
    expect(parseMonth('מרץ')).toBe(3);
    expect(parseMonth(11)).toBe(11);
  });
});

describe('finance import: building rows', () => {
  const header = ENTRIES_HEADERS;
  const sheet = [
    header,
    [2025, 'March', 'Income', '04/03/2025', 'x', 'Wedding', 'Cohen wedding', 'Client A', 'Bit', 'Shoot', 'NIS', 1200, 1200, '', 'Deposit'],
    [2025, 'March', 'Income', '05/03/2025', '', '', '', 'Client B', 'Card', '', 'USD', 100, '', 3.65, ''],
    [2025, 'March', 'Expense', '06/03/2025', '', '', '', 'Print shop', 'Card', 'Albums', 'NIS', -70, -70, '', ''],
    [2025, 'March', 'Transfer', '07/03/2025', '', '', '', '', '', '', 'NIS', 10, 10, '', ''],
    [2025, 'April', 'Expense', '', '', '', '', 'Landlord', '', 'Rent', 'NIS', 500, 500, '', ''],
    [2025, 'March', 'Expense', '08/03/2025', '', '', '', '', '', 'Rent', 'NIS', '', '', '', ''],
    [],
  ];

  const columns = guessColumns(headerNames(header, header.length));
  const settings: ImportSettings = {
    sheetKind: 'mixed',
    columns,
    kindValues: { income: 'income', expense: 'expense', transfer: 'skip' },
    categoryChoices: { albums: { newName: 'Albums' }, rent: { categoryId: 'cat-rent' }, '': { categoryId: 'cat-other' } },
    dayFirst: true,
  };

  it('turns the ledger into income and expense rows', () => {
    const result = buildImportRows(sheet, 0, settings, '2026-11-08');
    expect(result.totals.income).toEqual({ count: 2, minor: 120000 + 36500 });
    expect(result.totals.expense).toEqual({ count: 2, minor: 7000 + 50000 });
    expect(result.leftOut).toBe(1);
    expect(result.problems).toEqual([{ rowNumber: 7, code: 'no_amount' }]);

    const [a, b, expense, rent] = result.rows;
    expect(a).toMatchObject({ kind: 'income', date: '2025-03-04', name: 'Client A', job_name: 'Cohen wedding', description: 'Deposit' });
    expect(a.extra).toEqual([
      { label: 'Type', value: 'Shoot' },
      { label: 'Hashkafa', value: 'x' },
      { label: 'Type of Job', value: 'Wedding' },
    ]);
    expect(a.original_currency).toBeUndefined();
    expect(b).toMatchObject({ amount_minor: 36500, original_amount_minor: 10000, original_currency: 'USD', exchange_rate: 3.65 });
    expect(expense).toMatchObject({ kind: 'expense', amount_minor: 7000, category_name: 'Albums', name: 'Print shop' });
    // No date: falls back to year + month.
    expect(rent).toMatchObject({ date: '2025-04-01', category_id: 'cat-rent' });
  });

  it('gives identical rows different, stable fingerprints', () => {
    const twice = [header, sheet[1], sheet[1]];
    const r1 = buildImportRows(twice, 0, settings, '2026-11-08');
    const r2 = buildImportRows(twice, 0, settings, '2026-11-08');
    expect(r1.rows[0].fingerprint).not.toBe(r1.rows[1].fingerprint);
    expect(r1.rows.map((r) => r.fingerprint)).toEqual(r2.rows.map((r) => r.fingerprint));
  });

  it('flags future dates', () => {
    const future = [header, [2030, 'May', 'Income', '01/05/2030', '', '', '', '', '', '', 'NIS', 5, 5, '', '']];
    expect(buildImportRows(future, 0, settings, '2026-11-08').problems).toEqual([{ rowNumber: 2, code: 'future_date' }]);
  });
});

describe('finance import: reading files', () => {
  it('parses CSV with quotes, semicolons and Hebrew', () => {
    expect(parseCsv('a;b\n"1;2";"say ""hi"""\r\nשלום;\n')).toEqual([
      ['a', 'b'],
      ['1;2', 'say "hi"'],
      ['שלום', null],
    ]);
  });

  it('decodes Windows-1255 Hebrew when the file is not UTF-8', () => {
    // "שלום" in Windows-1255
    expect(decodeText(new Uint8Array([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום');
    expect(decodeText(new TextEncoder().encode('﻿שלום'))).toBe('שלום');
  });

  it('reads an Excel workbook with two tabs, shared strings and date cells', () => {
    const files = {
      'xl/workbook.xml': strToU8(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Entries" sheetId="1" r:id="rId1"/><sheet name="Receipts" sheetId="2" r:id="rId2"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
      'xl/sharedStrings.xml': strToU8(
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Date</t></si><si><t>Amount</t></si><si><r><t>לקו</t></r><r><t>ח</t></r></si></sst>',
      ),
      'xl/styles.xml': strToU8(
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" s="1"><v>45720</v></c><c r="C2" t="inlineStr"><is><t>Client</t></is></c></row><row r="4"><c r="B4"><v>12.5</v></c></row></sheetData></worksheet>',
      ),
      'xl/worksheets/sheet2.xml': strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
      ),
    };
    const sheets = readXlsx(zipSync(files));
    expect(sheets.map((s) => s.name)).toEqual(['Entries', 'Receipts']);
    expect(sheets[0].rows).toEqual([
      ['Date', 'Amount', 'לקוח'],
      ['2025-03-04', null, 'Client'],
      [],
      [null, 12.5],
    ]);
    expect(sheets[1].rows).toEqual([]);
  });
});
