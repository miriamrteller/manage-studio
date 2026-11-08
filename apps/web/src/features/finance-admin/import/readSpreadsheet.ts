import { unzipSync, strFromU8 } from 'fflate';

/** One cell: text, a number, or a date as 'YYYY-MM-DD' (Excel date cells). */
export type Cell = string | number | null;

export interface SheetData {
  name: string;
  rows: Cell[][];
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Reads a .csv or .xlsx file into one or more sheets of raw cells. */
export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new SpreadsheetError('too_large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || looksLikeZip(bytes)) return readXlsx(bytes);
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCsv(decodeText(bytes)) }];
  }
  throw new SpreadsheetError('unsupported');
}

export class SpreadsheetError extends Error {
  constructor(public code: 'too_large' | 'unsupported' | 'unreadable') {
    super(code);
  }
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * UTF-8 first; CSVs saved by Hebrew Excel are often Windows-1255, which would
 * otherwise turn Hebrew into gibberish.
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1255').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** RFC 4180 CSV with the delimiter guessed from the first line (comma, semicolon or tab). */
export function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t']
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (typeof c === 'string' && c.trim() === '' ? null : c)));
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function byTag(node: Document | Element, tag: string): Element[] {
  // Namespaced documents: match on local name.
  return Array.from(node.getElementsByTagName('*')).filter((el) => el.localName === tag);
}

function childByTag(node: Element, tag: string): Element | undefined {
  return Array.from(node.children).find((el) => el.localName === tag);
}

function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmy]/i.test(stripped) && !/^[#0.,%\s]*$/.test(stripped);
}

/** Excel serial day number → 'YYYY-MM-DD' (1900 or 1904 date system). */
export function excelSerialToIso(serial: number, date1904 = false): string {
  const days = Math.floor(serial) + (date1904 ? 1462 : 0);
  const ms = Date.UTC(1899, 11, 30) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolvePath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return `xl/${target}`.replace(/\/\.\//g, '/');
}

export function readXlsx(bytes: Uint8Array): SheetData[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new SpreadsheetError('unreadable');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null);

  const workbookXml = text('xl/workbook.xml');
  if (!workbookXml) throw new SpreadsheetError('unreadable');
  const workbook = xml(workbookXml);
  const date1904 = byTag(workbook, 'workbookPr').some((el) => ['1', 'true'].includes(el.getAttribute('date1904') ?? ''));

  const rels = new Map<string, string>();
  const relsXml = text('xl/_rels/workbook.xml.rels');
  if (relsXml) {
    for (const rel of byTag(xml(relsXml), 'Relationship')) {
      rels.set(rel.getAttribute('Id') ?? '', resolvePath(rel.getAttribute('Target') ?? ''));
    }
  }

  const shared: string[] = [];
  const sharedXml = text('xl/sharedStrings.xml');
  if (sharedXml) {
    for (const si of byTag(xml(sharedXml), 'si')) {
      shared.push(byTag(si, 't').map((t) => t.textContent ?? '').join(''));
    }
  }

  // Which cell styles are dates.
  const dateStyles = new Set<number>();
  const stylesXml = text('xl/styles.xml');
  if (stylesXml) {
    const styles = xml(stylesXml);
    const custom = new Map<number, string>();
    for (const fmt of byTag(styles, 'numFmt')) {
      custom.set(Number(fmt.getAttribute('numFmtId')), fmt.getAttribute('formatCode') ?? '');
    }
    const cellXfs = byTag(styles, 'cellXfs')[0];
    if (cellXfs) {
      Array.from(cellXfs.children)
        .filter((el) => el.localName === 'xf')
        .forEach((xf, i) => {
          const id = Number(xf.getAttribute('numFmtId') ?? 0);
          if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)!))) {
            dateStyles.add(i);
          }
        });
    }
  }

  const sheets: SheetData[] = [];
  byTag(workbook, 'sheet').forEach((sheetEl, i) => {
    const name = sheetEl.getAttribute('name') ?? `Sheet${i + 1}`;
    const relId =
      sheetEl.getAttribute('r:id') ??
      Array.from(sheetEl.attributes).find((a) => a.localName === 'id')?.value ??
      '';
    const path = rels.get(relId) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const sheetXml = text(path);
    if (!sheetXml) return;
    const rows: Cell[][] = [];
    for (const rowEl of byTag(xml(sheetXml), 'row')) {
      const rowNumber = Number(rowEl.getAttribute('r') ?? rows.length + 1) - 1;
      const row: Cell[] = [];
      let nextCol = 0;
      for (const c of Array.from(rowEl.children).filter((el) => el.localName === 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? columnIndex(ref) : nextCol;
        nextCol = col + 1;
        row[col] = cellValue(c, shared, dateStyles, date1904);
      }
      rows[rowNumber] = Array.from(row, (v) => v ?? null);
    }
    sheets.push({ name, rows: Array.from(rows, (r) => r ?? []) });
  });
  return sheets;
}

function cellValue(c: Element, shared: string[], dateStyles: Set<number>, date1904: boolean): Cell {
  const type = c.getAttribute('t');
  const v = childByTag(c, 'v')?.textContent ?? null;
  if (type === 'inlineStr') {
    const is = childByTag(c, 'is');
    const value = is ? byTag(is, 't').map((t) => t.textContent ?? '').join('') : '';
    return value.trim() === '' ? null : value;
  }
  if (v === null || v === '') return null;
  if (type === 's') {
    const value = shared[Number(v)] ?? '';
    return value.trim() === '' ? null : value;
  }
  if (type === 'str' || type === 'e') return v;
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (dateStyles.has(Number(c.getAttribute('s') ?? -1))) return excelSerialToIso(n, date1904);
  return n;
}
