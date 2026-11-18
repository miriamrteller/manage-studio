import type { Cell } from '@/features/finance-admin/import/readSpreadsheet';
import { cellText, normalise, parseDate } from '@/features/finance-admin/import/importRows';

/** Where a sheet column goes on the client import. 'skip' leaves it out. */
export type ClientFieldKey =
  | 'name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'student_name'
  | 'student_dob'
  | 'shoot_name'
  | 'shoot_date'
  | 'skip';

/**
 * Fields a column can go to, in the order the screen lists them. Student fields only at family
 * studios; past shoot fields only with Projects.
 */
export function clientFieldKeys(families: boolean, projects = false): ClientFieldKey[] {
  const keys: ClientFieldKey[] = ['name', 'first_name', 'last_name', 'email', 'phone'];
  if (families) keys.push('student_name', 'student_dob');
  if (projects) keys.push('shoot_name', 'shoot_date');
  keys.push('skip');
  return keys;
}

export interface ClientColumn {
  index: number;
  header: string;
  field: ClientFieldKey;
}

export interface ImportStudent {
  name: string;
  date_of_birth: string | null;
}

/** A past shoot for the client: marked Shot, on the package with this name. */
export interface ImportShoot {
  name: string;
  date: string | null;
}

/**
 * One client as import_clients takes it. rowNumbers: the sheet rows it came from (1-based).
 * person_id: the existing client the screen matched (their shoots are added, they are not).
 */
export interface ImportClient {
  name: string;
  email: string | null;
  phone: string | null;
  family_name?: string;
  students?: ImportStudent[];
  shoots?: ImportShoot[];
  person_id?: string;
  rowNumbers: number[];
}

export type ClientProblemCode = 'no_name' | 'bad_email' | 'repeat' | 'bad_dob' | 'bad_shoot_date';

export interface ClientProblem {
  rowNumber: number;
  code: ClientProblemCode;
}

export interface BuiltClients {
  clients: ImportClient[];
  students: number;
  /** Past shoots on the sheet (one per client and shoot). */
  shoots: number;
  problems: ClientProblem[];
  /** Rows not imported (no name, or a repeat of an earlier row). */
  leftOut: number;
}

/**
 * English and Hebrew header patterns, checked in order (first match wins). Student
 * patterns come first so "Student name" is never read as the client's name.
 */
const HEADER_RULES: Array<[ClientFieldKey, RegExp]> = [
  ['shoot_date', /^(shoot|session|project)'?s? date$|^date of (the )?(shoot|session)$|^date$|^תאריך( (ה)?(צילום|פרויקט))?$/],
  ['shoot_name', /^(shoot|session|project|package)'?s?( name| type)?$|^(שם |סוג )?(ה)?(צילום|פרויקט|חבילה)$/],
  ['student_dob', /^((student|child|pupil|dancer)'?s? )?(date of birth|birth ?date|dob|birthday)$|^תאריך לידה( (של )?(התלמיד|התלמידה|הילד|הילדה))?$|^ת\.? ?לידה$/],
  ['student_name', /^(student|child|pupil|dancer|kid)'?s?( full)?( name)?$|^שם (התלמיד|התלמידה|התלמיד\/ה|הילד|הילדה|הילד\/ה|הרקדן|הרקדנית)$|^(תלמיד|תלמידה|תלמיד\/ה|ילד|ילדה|ילד\/ה)$/],
  ['email', /e-? ?mail|^mail$|אימייל|אי-?מייל|דוא"?ל|דואר אלקטרוני|^מייל$/],
  ['phone', /phone|mobile|cell|tel\b|whats ?app|טלפון|נייד|פלאפון|סלולרי|וואטסאפ|ווטסאפ/],
  ['first_name', /^(first|given)( name)?$|^שם פרטי$/],
  ['last_name', /^(last|family|sur)( ?name)?$|^שם משפחה$/],
  ['name', /^(full )?name$|^(client|customer|contact|parent|guardian|payer)'?s?( full)?( name)?$|^שם( מלא)?$|^שם (הלקוח|הלקוחה|לקוח|ההורה|הורה|איש קשר)$|^(לקוח|לקוחה|הורה|איש קשר)$/],
];

const SINGLE_USE = new Set<ClientFieldKey>([
  'name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'student_name',
  'student_dob',
  'shoot_name',
  'shoot_date',
]);

export function guessClientField(header: string, families: boolean, projects = false): ClientFieldKey {
  const h = normalise(header);
  for (const [field, re] of HEADER_RULES) {
    if (!re.test(h)) continue;
    if (!families && (field === 'student_name' || field === 'student_dob')) return 'skip';
    if (!projects && (field === 'shoot_name' || field === 'shoot_date')) return 'skip';
    return field;
  }
  return 'skip';
}

/** Prefilled column matches: each field goes to the first column that fits. */
export function guessClientColumns(headers: string[], families: boolean, projects = false): ClientColumn[] {
  const used = new Set<ClientFieldKey>();
  return headers.map((header, index) => {
    let field = guessClientField(header, families, projects);
    if (SINGLE_USE.has(field)) {
      if (used.has(field)) field = 'skip';
      else used.add(field);
    }
    return { index, header, field };
  });
}

/** Simple shape check; the database checks again. */
export function looksLikeEmail(value: string): boolean {
  return value.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * A phone as text. Excel stores numbers like 0501234567 as 501234567: a number of 8 or 9
 * digits gets its leading 0 back.
 */
export function phoneText(cell: Cell | undefined): string {
  if (typeof cell === 'number') {
    const s = String(Math.round(cell));
    return /^[1-9]\d{7,8}$/.test(s) ? `0${s}` : s;
  }
  return cellText(cell).slice(0, 40);
}

/** Digits only, +972 as 0: the same key the database matches on. */
export function phoneKey(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00972')) d = `0${d.slice(5)}`;
  else if (d.startsWith('972') && d.length >= 11) d = `0${d.slice(3)}`;
  return d.length >= 7 ? d : '';
}

export interface BuildClientOptions {
  columns: ClientColumn[];
  /** Family studios: rows with a student become a family. */
  families: boolean;
  dayFirst: boolean;
  /** The family account name for a parent, e.g. "Dana Cohen family". */
  familyName: (parentName: string) => string;
  /** Studios with Projects: rows with a shoot name or date get a past shoot. */
  projects?: boolean;
  /** The shoot name for a row with a shoot date but no shoot name. */
  defaultShootName?: string;
  /** Today (YYYY-MM-DD): later shoot dates are left out. Defaults to the device's today. */
  today?: string;
}

/**
 * Sheet rows → clients to import. Rows for the same person (same email, else phone, else
 * name) become one client; at family studios their students are gathered together.
 */
export function buildClients(rows: Cell[][], headerRow: number, opts: BuildClientOptions): BuiltClients {
  const col = (field: ClientFieldKey) => opts.columns.find((c) => c.field === field)?.index;
  const cName = col('name');
  const cFirst = col('first_name');
  const cLast = col('last_name');
  const cEmail = col('email');
  const cPhone = col('phone');
  const cStudent = opts.families ? col('student_name') : undefined;
  const cDob = opts.families ? col('student_dob') : undefined;
  const cShoot = opts.projects ? col('shoot_name') : undefined;
  const cShootDate = opts.projects ? col('shoot_date') : undefined;
  const today = opts.today ?? localToday();
  const text = (row: Cell[], c: number | undefined) => (c === undefined ? '' : cellText(row[c]));

  const clients: ImportClient[] = [];
  const byKey = new Map<string, ImportClient>();
  const problems: ClientProblem[] = [];
  let leftOut = 0;
  let students = 0;
  let shoots = 0;

  rows.slice(headerRow + 1).forEach((row, i) => {
    const rowNumber = headerRow + i + 2;
    if (!row.some((c) => cellText(c) !== '')) return;

    const name = (text(row, cName) || [text(row, cFirst), text(row, cLast)].filter(Boolean).join(' ')).slice(0, 200);
    let email = text(row, cEmail).toLowerCase();
    const phone = cPhone === undefined ? '' : phoneText(row[cPhone]);
    const studentName = text(row, cStudent).slice(0, 200);

    if (!name) {
      problems.push({ rowNumber, code: 'no_name' });
      leftOut++;
      return;
    }
    if (email && !looksLikeEmail(email)) {
      problems.push({ rowNumber, code: 'bad_email' });
      email = '';
    }

    let student: ImportStudent | null = null;
    if (studentName) {
      const rawDob = cDob === undefined ? undefined : row[cDob];
      const dob = rawDob === undefined || cellText(rawDob) === '' ? null : parseDate(rawDob, opts.dayFirst);
      if (rawDob !== undefined && cellText(rawDob) !== '' && !dob) problems.push({ rowNumber, code: 'bad_dob' });
      student = { name: studentName, date_of_birth: dob };
    }

    // A past shoot: the shoot name, or the default name for a row with only a shoot date.
    let shoot: ImportShoot | null = null;
    const rawShootDate = cShootDate === undefined ? undefined : row[cShootDate];
    const hasShootDate = rawShootDate !== undefined && cellText(rawShootDate) !== '';
    const shootName = text(row, cShoot).slice(0, 200);
    if (shootName || (hasShootDate && opts.defaultShootName)) {
      let date = hasShootDate ? parseDate(rawShootDate, opts.dayFirst) : null;
      if (hasShootDate && (!date || date > today)) {
        problems.push({ rowNumber, code: 'bad_shoot_date' });
        date = null;
      }
      shoot = { name: shootName || opts.defaultShootName!.slice(0, 200), date };
    }

    const key = email ? `e:${email}` : phoneKey(phone) ? `p:${phoneKey(phone)}` : `n:${normalise(name)}`;
    const earlier = byKey.get(key);
    if (earlier) {
      // The same person on another row: add their student or their other shoot.
      // Anything else is a repeat.
      let added = false;
      if (student && earlier.students && !earlier.students.some((s) => normalise(s.name) === normalise(student!.name))) {
        earlier.students.push(student);
        students++;
        added = true;
      }
      if (shoot && !(earlier.shoots ?? []).some((s) => sameShoot(s, shoot!))) {
        earlier.shoots = [...(earlier.shoots ?? []), shoot];
        shoots++;
        added = true;
      }
      if (added) {
        earlier.rowNumbers.push(rowNumber);
        return;
      }
      problems.push({ rowNumber, code: 'repeat' });
      leftOut++;
      return;
    }

    const client: ImportClient = { name, email: email || null, phone: phone || null, rowNumbers: [rowNumber] };
    if (opts.families && cStudent !== undefined) {
      client.students = student ? [student] : [];
      client.family_name = opts.familyName(name).slice(0, 200);
      if (student) students++;
    }
    if (shoot) {
      client.shoots = [shoot];
      shoots++;
    }
    byKey.set(key, client);
    clients.push(client);
  });

  return { clients, students, shoots, problems, leftOut };
}

/** Same package name (case and spaces ignored) and the same day, or either undated: the database's rule. */
function sameShoot(a: ImportShoot, b: ImportShoot): boolean {
  if (normalise(a.name) !== normalise(b.name)) return false;
  return a.date === null || b.date === null || a.date === b.date;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True when some date in the column reads differently day-first and month-first. */
export { hasAmbiguousDates } from '@/features/finance-admin/import/importRows';
