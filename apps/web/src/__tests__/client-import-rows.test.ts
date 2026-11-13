import { describe, expect, it } from 'vitest';
import {
  buildClients,
  clientFieldKeys,
  guessClientColumns,
  phoneKey,
  phoneText,
  type ClientColumn,
} from '@/features/students/import/clientImportRows';
import type { Cell } from '@/features/finance-admin/import/readSpreadsheet';

const familyName = (name: string) => `${name} family`;

describe('client import: column guesses', () => {
  it('matches English and Hebrew headers', () => {
    const cols = guessClientColumns(['Full name', 'E-mail', 'Mobile', 'Notes'], false);
    expect(cols.map((c) => c.field)).toEqual(['name', 'email', 'phone', 'skip']);
    const he = guessClientColumns(['שם פרטי', 'שם משפחה', 'דוא"ל', 'טלפון נייד'], false);
    expect(he.map((c) => c.field)).toEqual(['first_name', 'last_name', 'email', 'phone']);
  });

  it('student columns only at family studios, and never mistaken for the client name', () => {
    const headers = ['Parent name', 'Email', "Student's name", 'Date of birth'];
    expect(guessClientColumns(headers, true).map((c) => c.field)).toEqual(['name', 'email', 'student_name', 'student_dob']);
    expect(guessClientColumns(headers, false).map((c) => c.field)).toEqual(['name', 'email', 'skip', 'skip']);
    expect(clientFieldKeys(false)).not.toContain('student_name');
    expect(guessClientColumns(['שם ההורה', 'שם התלמיד', 'תאריך לידה'], true).map((c) => c.field)).toEqual([
      'name',
      'student_name',
      'student_dob',
    ]);
  });

  it('each field goes to the first column that fits', () => {
    expect(guessClientColumns(['Email', 'Email 2'], false).map((c) => c.field)).toEqual(['email', 'skip']);
  });
});

describe('client import: phones', () => {
  it('Excel number phones get their leading 0 back', () => {
    expect(phoneText(501234567)).toBe('0501234567');
    expect(phoneText('050-123-4567')).toBe('050-123-4567');
  });
  it('the match key ignores spaces and +972', () => {
    expect(phoneKey('+972 50-123-4567')).toBe('0501234567');
    expect(phoneKey('050 123 4567')).toBe('0501234567');
    expect(phoneKey('12')).toBe('');
  });
});

describe('client import: building clients', () => {
  const cols = (fields: ClientColumn['field'][]): ClientColumn[] =>
    fields.map((field, index) => ({ index, header: field, field }));

  it('photographer-style sheet: one client per person, repeats and nameless rows left out', () => {
    const rows: Cell[][] = [
      ['First', 'Last', 'Email', 'Phone'],
      ['Dana', 'Levi', 'Dana@Example.test', '050-111-2222'],
      ['', '', 'nobody@example.test', ''],
      ['Dana', 'Levi', 'dana@example.test', ''],
      ['Avi', '', 'not an email', 521234567],
      [null, null, null, null],
    ];
    const built = buildClients(rows, 0, {
      columns: cols(['first_name', 'last_name', 'email', 'phone']),
      families: false,
      dayFirst: true,
      familyName,
    });
    expect(built.clients).toEqual([
      { name: 'Dana Levi', email: 'dana@example.test', phone: '050-111-2222', rowNumbers: [2] },
      { name: 'Avi', email: null, phone: '0521234567', rowNumbers: [5] },
    ]);
    expect(built.problems).toEqual([
      { rowNumber: 3, code: 'no_name' },
      { rowNumber: 4, code: 'repeat' },
      { rowNumber: 5, code: 'bad_email' },
    ]);
    expect(built.leftOut).toBe(2);
  });

  it('family studio: one parent on two rows becomes one family with two students', () => {
    const rows: Cell[][] = [
      ['Parent', 'Email', 'Student', 'DOB'],
      ['Rina Cohen', 'rina@example.test', 'Noa', '03/04/2016'],
      ['Rina Cohen', 'rina@example.test', 'Tom', 'soon'],
      ['Adult Dancer', 'adult@example.test', '', ''],
    ];
    const built = buildClients(rows, 0, {
      columns: cols(['name', 'email', 'student_name', 'student_dob']),
      families: true,
      dayFirst: true,
      familyName,
    });
    expect(built.clients).toHaveLength(2);
    expect(built.clients[0]).toEqual({
      name: 'Rina Cohen',
      email: 'rina@example.test',
      phone: null,
      family_name: 'Rina Cohen family',
      students: [
        { name: 'Noa', date_of_birth: '2016-04-03' },
        { name: 'Tom', date_of_birth: null },
      ],
      rowNumbers: [2, 3],
    });
    expect(built.clients[1].students).toEqual([]);
    expect(built.students).toBe(2);
    expect(built.problems).toEqual([{ rowNumber: 3, code: 'bad_dob' }]);
  });
});
