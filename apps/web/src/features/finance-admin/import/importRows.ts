import type { Cell } from './readSpreadsheet';

/** Where a sheet column goes. 'extra' keeps it under its own name; 'skip' leaves it out. */
export type FieldKey =
  | 'kind'
  | 'date'
  | 'year'
  | 'month'
  | 'amount'
  | 'original_amount'
  | 'currency'
  | 'exchange_rate'
  | 'category'
  | 'name'
  | 'payment_method'
  | 'job_name'
  | 'description'
  | 'receipt_book'
  | 'receipt_number'
  | 'extra'
  | 'skip';

/** Fields a column can be matched to, in the order the import screen lists them. */
export const FIELD_KEYS: readonly FieldKey[] = [
  'kind',
  'date',
  'year',
  'month',
  'amount',
  'original_amount',
  'currency',
  'exchange_rate',
  'category',
  'name',
  'payment_method',
  'job_name',
  'description',
  'receipt_book',
  'receipt_number',
  'extra',
  'skip',
];

/** Fields that only one column can use (the rest can repeat). */
const SINGLE_USE = new Set<FieldKey>(FIELD_KEYS.filter((k) => k !== 'extra' && k !== 'skip'));

export type SheetKind = 'mixed' | 'expenses' | 'income' | 'receipts';
export type RowKind = 'income' | 'expense' | 'receipt';
export type KindChoice = 'income' | 'expense' | 'skip';
export type CategoryChoice = { categoryId: string } | { newName: string };

export interface ColumnMapping {
  index: number;
  header: string;
  field: FieldKey;
}

export interface ImportSettings {
  sheetKind: SheetKind;
  columns: ColumnMapping[];
  /** For 'mixed' sheets: what each value of the income/expense column means (keys normalised). */
  kindValues: Record<string, KindChoice>;
  /** Expense category for each value of the category column (keys normalised; '' = empty). */
  categoryChoices: Record<string, CategoryChoice>;
  /** 03/04/2025 is 3 April (true, Israeli order) or 4 March (false). */
  dayFirst: boolean;
}

export interface ImportRow {
  kind: RowKind;
  date: string;
  amount_minor: number;
  original_amount_minor?: number;
  original_currency?: string;
  exchange_rate?: number;
  name?: string;
  payment_method?: string;
  job_name?: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  receipt_book?: string;
  receipt_number?: string;
  extra: Array<{ label: string; value: string }>;
  fingerprint: string;
}

export type ProblemCode = 'no_date' | 'no_amount' | 'zero_amount' | 'future_date' | 'no_type';

export interface RowProblem {
  /** Row number as the studio sees it in the spreadsheet (1-based). */
  rowNumber: number;
  code: ProblemCode;
}

export interface BuildResult {
  rows: ImportRow[];
  problems: RowProblem[];
  /** Rows the studio chose to leave out (for example a "Transfer" type). */
  leftOut: number;
  totals: Record<RowKind, { count: number; minor: number }>;
}

// ── text helpers ─────────────────────────────────────────────────────────────

/** Lower-case, no punctuation or direction marks, single spaces: for matching. */
export function normalise(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}"'/\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).trim();
}

// ── header row and column guesses ────────────────────────────────────────────

/** The header row: the first row with at least two filled cells. */
export function findHeaderRow(rows: Cell[][]): number {
  const i = rows.findIndex((r) => r.filter((c) => cellText(c) !== '').length >= 2);
  return i === -1 ? 0 : i;
}

/** Header names, with blanks named by column letter and repeats numbered ("Notes 2"). */
export function headerNames(row: Cell[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const base = cellText(row[i]) || `Column ${columnLetter(i)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** English and Hebrew header patterns, checked in order (first match wins). */
const HEADER_RULES: Array<[FieldKey, RegExp]> = [
  ['kind', /^(income ?(or|\/) ?expenses?|expenses? ?(or|\/) ?income|in ?\/ ?out|הכנסה ?(או|\/) ?הוצאה|הוצאה ?(או|\/) ?הכנסה|סוג תנועה|הכנסה הוצאה)$/],
  ['exchange_rate', /(rate|שער)/],
  ['currency', /^(currency|usd or nis|nis or usd|ils or usd|usd or ils|מטבע|סוג מטבע)$/],
  ['amount', /(nis|ils) (equivalent|total|amount)|(equivalent|total|amount) (in )?(nis|ils)|^(total|amount|sum|סכום|סה"?כ|סך הכל|ש"?ח|nis|ils)$|סכום בש"?ח|סכום בשקלים|שווה ערך|סה"?כ ש"?ח|סה"?כ בש"?ח/],
  ['original_amount', /^(numeric value|value|original amount|amount in currency|ערך|סכום מקורי|סכום במטבע)$/],
  ['date', /^(date|day|transaction date|payment date|receipt date|תאריך|תאריך תשלום|תאריך קבלה|תאריך עסקה)$/],
  ['year', /^(year|שנה)$/],
  ['month', /^(month|חודש)$/],
  ['receipt_book', /(receipt book|^book$|פנקס)/],
  ['receipt_number', /(receipt|invoice|קבלה|חשבונית)( ?(number|no|#|מספר|מס'?))?$|^(מספר|מס'?) (קבלה|חשבונית)$/],
  ['job_name', /^(job name|job|project|event|event name|שם עבודה|שם העבודה|עבודה|פרויקט|אירוע|שם אירוע)$/],
  ['category', /^(type|category|expense type|expense category|סוג|קטגוריה|סוג הוצאה|סיווג)$/],
  ['payment_method', /(payment method|^method$|paid by|אמצעי תשלום|צורת תשלום|אופן תשלום)/],
  ['name', /^(recipient|recipient name|customer|customer name|client|client name|payer|paid by|supplier|vendor|name|שם|שם לקוח|לקוח|ספק|שם ספק|מקבל|משלם|שם המשלם)$/],
  ['description', /^(notes?|description|details|remarks|comments?|הערות|הערה|תיאור|פירוט)$/],
];

export function guessField(header: string): FieldKey {
  const h = normalise(header);
  for (const [field, re] of HEADER_RULES) if (re.test(h)) return field;
  return 'extra';
}

/** Prefilled column matches: each single-use field goes to the first column that fits. */
export function guessColumns(headers: string[]): ColumnMapping[] {
  const used = new Set<FieldKey>();
  return headers.map((header, index) => {
    let field = guessField(header);
    if (SINGLE_USE.has(field)) {
      if (used.has(field)) field = 'extra';
      else used.add(field);
    }
    return { index, header, field };
  });
}

export function guessSheetKind(columns: ColumnMapping[]): SheetKind {
  const has = (f: FieldKey) => columns.some((c) => c.field === f);
  if (has('kind')) return 'mixed';
  if (has('receipt_number') || has('receipt_book')) return 'receipts';
  if (has('category')) return 'expenses';
  return 'income';
}

export function guessKindValue(value: string): KindChoice {
  const v = normalise(value);
  if (/^(income|in|revenue|credit|הכנסה|הכנסות|זכות)$/.test(v)) return 'income';
  if (/^(expense|expenses|out|cost|debit|הוצאה|הוצאות|חובה)$/.test(v)) return 'expense';
  return 'skip';
}

/** Distinct (normalised) values of one column below the header, with how often each appears. */
export function distinctValues(rows: Cell[][], headerRow: number, col: number): Array<{ key: string; label: string; count: number }> {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const row of rows.slice(headerRow + 1)) {
    if (!row.some((c) => cellText(c) !== '')) continue;
    const label = cellText(row[col]);
    const key = normalise(label);
    const entry = map.get(key) ?? { key, label, count: 0 };
    entry.count++;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ── values ───────────────────────────────────────────────────────────────────

/** "₪1,234.50", "1.234,50", "(120)", "120-", 120 → number; anything else → null. */
export function parseAmount(cell: Cell | undefined): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  let s = cellText(cell)
    .replace(/[\u200e\u200f\u202a-\u202e\u00a0\s]/g, '')
    .replace(/ש"?ח|שקלים|שקל|nis|ils|usd|eur|gbp|[₪$€£]/gi, '');
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

export function parseCurrency(cell: Cell | undefined): string | null {
  const v = normalise(cell);
  if (cellText(cell) === '') return null;
  if (/usd|dollar|דולר|^\$$/.test(v) || cellText(cell).includes('$')) return 'USD';
  if (/eur|euro|יורו/.test(v) || cellText(cell).includes('€')) return 'EUR';
  if (/gbp|pound|ליש"?ט/.test(v) || cellText(cell).includes('£')) return 'GBP';
  if (/nis|ils|ש"?ח|שקל|shekel/.test(v) || cellText(cell).includes('₪')) return 'ILS';
  const code = cellText(cell).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ינואר: 1, feb: 2, february: 2, פברואר: 2, mar: 3, march: 3, מרץ: 3, מרס: 3,
  apr: 4, april: 4, אפריל: 4, may: 5, מאי: 5, jun: 6, june: 6, יוני: 6, jul: 7, july: 7, יולי: 7,
  aug: 8, august: 8, אוגוסט: 8, sep: 9, sept: 9, september: 9, ספטמבר: 9, oct: 10, october: 10, אוקטובר: 10,
  nov: 11, november: 11, נובמבר: 11, dec: 12, december: 12, דצמבר: 12,
};

export function parseMonth(cell: Cell | undefined): number | null {
  if (typeof cell === 'number') return cell >= 1 && cell <= 12 ? Math.trunc(cell) : null;
  const v = normalise(cell);
  if (/^\d{1,2}$/.test(v)) {
    const n = Number(v);
    return n >= 1 && n <= 12 ? n : null;
  }
  if (/^\d{4}-\d{2}/.test(cellText(cell))) return Number(cellText(cell).slice(5, 7));
  return MONTHS[v] ?? MONTHS[v.slice(0, 3)] ?? null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Dates as written in Israeli or US sheets, ISO, or Excel day numbers → 'YYYY-MM-DD'. */
export function parseDate(cell: Cell | undefined, dayFirst = true): string | null {
  if (typeof cell === 'number') {
    if (cell < 20000 || cell > 80000) return null;
    const ms = Date.UTC(1899, 11, 30) + Math.floor(cell) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = cellText(cell);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(\D|$)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
  let first = dayFirst;
  if (a > 12) first = true;
  else if (b > 12) first = false;
  return first ? validYmd(y, b, a) : validYmd(y, a, b);
}

/** True when some date in the column reads differently day-first and month-first. */
export function hasAmbiguousDates(rows: Cell[][], headerRow: number, col: number): boolean {
  return rows.slice(headerRow + 1).some((row) => {
    const m = cellText(row[col]).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    return !!m && Number(m[1]) <= 12 && Number(m[2]) <= 12 && m[1] !== m[2];
  });
}

/** Short, stable id for a row, so the same row is never imported twice. */
export function rowFingerprint(parts: string[]): string {
  const text = parts.join('|');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}${hex(h1 ^ 0x5bd1e995)}${hex(h2 ^ 0x1b873593)}`;
}

// ── building the rows ────────────────────────────────────────────────────────

/** Turns the sheet into rows ready for import, using the studio's choices. */
export function buildImportRows(
  rows: Cell[][],
  headerRow: number,
  settings: ImportSettings,
  today: string,
  studioCurrency = 'ILS',
): BuildResult {
  const col = (field: FieldKey) => settings.columns.find((c) => c.field === field)?.index;
  const idx = {
    kind: col('kind'), date: col('date'), year: col('year'), month: col('month'),
    amount: col('amount'), original: col('original_amount'), currency: col('currency'),
    rate: col('exchange_rate'), category: col('category'), name: col('name'),
    method: col('payment_method'), job: col('job_name'), description: col('description'),
    book: col('receipt_book'), number: col('receipt_number'),
  };
  const extraCols = settings.columns.filter((c) => c.field === 'extra');
  const categoryHeader = settings.columns.find((c) => c.field === 'category')?.header ?? '';
  const get = (row: Cell[], i: number | undefined) => (i === undefined ? undefined : row[i]);
  const text = (row: Cell[], i: number | undefined) => cellText(get(row, i)) || undefined;

  const result: BuildResult = {
    rows: [],
    problems: [],
    leftOut: 0,
    totals: { income: { count: 0, minor: 0 }, expense: { count: 0, minor: 0 }, receipt: { count: 0, minor: 0 } },
  };
  const occurrences = new Map<string, number>();

  rows.slice(headerRow + 1).forEach((row, offset) => {
    const rowNumber = headerRow + offset + 2;
    if (!row.some((c) => cellText(c) !== '')) return;

    let kind: RowKind;
    if (settings.sheetKind === 'mixed') {
      const choice = settings.kindValues[normalise(get(row, idx.kind))] ?? 'skip';
      if (choice === 'skip') {
        if (cellText(get(row, idx.kind)) === '') result.problems.push({ rowNumber, code: 'no_type' });
        else result.leftOut++;
        return;
      }
      kind = choice;
    } else {
      kind = settings.sheetKind === 'expenses' ? 'expense' : settings.sheetKind === 'receipts' ? 'receipt' : 'income';
    }

    let date = parseDate(get(row, idx.date), settings.dayFirst);
    if (!date && idx.year !== undefined) {
      const year = parseAmount(get(row, idx.year));
      const month = parseMonth(get(row, idx.month)) ?? 1;
      if (year && year >= 1970 && year <= 2100) date = `${Math.trunc(year)}-${pad(month)}-01`;
    }
    if (!date) {
      result.problems.push({ rowNumber, code: 'no_date' });
      return;
    }
    if (date > today) {
      result.problems.push({ rowNumber, code: 'future_date' });
      return;
    }

    const original = parseAmount(get(row, idx.original));
    const currency = parseCurrency(get(row, idx.currency)) ?? (original !== null ? studioCurrency : null);
    const rate = parseAmount(get(row, idx.rate));
    let amount = parseAmount(get(row, idx.amount));
    if (amount === null && original !== null) {
      if (currency === studioCurrency) amount = original;
      else if (rate) amount = original * rate;
    }
    if (amount === null) {
      result.problems.push({ rowNumber, code: 'no_amount' });
      return;
    }
    let minor = Math.round(amount * 100);
    if (kind === 'expense') minor = Math.abs(minor);
    if (minor === 0) {
      result.problems.push({ rowNumber, code: 'zero_amount' });
      return;
    }

    const extra = extraCols
      .map((c) => ({ label: c.header, value: cellText(row[c.index]) }))
      .filter((e) => e.value !== '');

    const out: ImportRow = { kind, date, amount_minor: minor, extra, fingerprint: '' };
    if (original !== null && currency && currency !== studioCurrency) {
      out.original_amount_minor = Math.round(original * 100);
      out.original_currency = currency;
      if (rate) out.exchange_rate = rate;
    }
    const name = text(row, idx.name);
    if (name) out.name = name;
    const method = text(row, idx.method);
    if (method) out.payment_method = method;
    const job = text(row, idx.job);
    if (job) out.job_name = job;
    const description = text(row, idx.description);
    if (description) out.description = description;
    const book = text(row, idx.book);
    if (book) out.receipt_book = book;
    const number = text(row, idx.number);
    if (number) out.receipt_number = number;

    const categoryText = cellText(get(row, idx.category));
    if (kind === 'expense') {
      const choice = settings.categoryChoices[normalise(categoryText)] ?? settings.categoryChoices[''];
      if (choice && 'categoryId' in choice) out.category_id = choice.categoryId;
      else out.category_name = choice?.newName || categoryText || 'Other';
    } else if (categoryText) {
      out.extra.unshift({ label: categoryHeader, value: categoryText });
    }

    const key = [kind, date, String(minor), normalise(name), book ?? '', number ?? ''].join('|');
    const seen = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, seen);
    out.fingerprint = rowFingerprint([key, String(seen)]);

    result.rows.push(out);
    result.totals[kind].count++;
    result.totals[kind].minor += minor;
  });

  return result;
}
