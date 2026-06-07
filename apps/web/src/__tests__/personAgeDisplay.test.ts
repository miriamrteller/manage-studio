import { describe, expect, it, vi } from 'vitest';
import {
  enrolmentAgeMismatchMessage,
  enrolmentShowingForAgeMessage,
  formatEnrolmentStudentAgeLine,
  formatPersonAgeLabel,
  formatPersonSearchAgeLine,
  isAdultAge,
  personAgeLabel,
} from '@/lib/personAge';

const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
  if (key === 'pages.students.age_adult') return 'Adult';
  if (key === 'person_search.adult') return 'Adult';
  if (key === 'common.age_18_plus') return '18+';
  if (key === 'pages.enrolment.student_age') return `Age ${opts?.age}`;
  if (key === 'person_search.age') return `Age ${opts?.age}`;
  if (key === 'pages.enrolment.showing_for_age') return `Showing classes suitable for age ${opts?.age}.`;
  if (key === 'pages.enrolment.showing_for_age_18_plus') return 'Showing classes suitable for ages 18+.';
  if (key === 'pages.enrolment.selected_class_age_mismatch') {
    return `This student will be age ${opts?.age} at season start. Class: ${opts?.classAges}.`;
  }
  if (key === 'pages.enrolment.selected_class_age_mismatch_adult') {
    return `This student will be an adult at season start. Class: ${opts?.classAges}.`;
  }
  return key;
});

describe('personAge display', () => {
  it('identifies adults at 18+', () => {
    expect(isAdultAge(17)).toBe(false);
    expect(isAdultAge(18)).toBe(true);
    expect(isAdultAge(31)).toBe(true);
  });

  it('never returns numeric personAgeLabel for adults', () => {
    expect(personAgeLabel('1994-08-12')).toBeNull();
    const minorLabel = personAgeLabel('2020-01-01');
    expect(minorLabel).not.toBeNull();
    expect(Number(minorLabel)).toBeLessThan(18);
  });

  it('formats person labels as Adult for 18+', () => {
    expect(formatPersonAgeLabel(31, t)).toBe('Adult');
    expect(formatPersonAgeLabel(7, t)).toBe('7');
  });

  it('formats enrolment class filter message as 18+ for adults', () => {
    expect(enrolmentShowingForAgeMessage(31, t)).toBe('Showing classes suitable for ages 18+.');
    expect(enrolmentShowingForAgeMessage(7, t)).toBe('Showing classes suitable for age 7.');
  });

  it('formats age mismatch for adults without a specific age', () => {
    expect(enrolmentAgeMismatchMessage(31, '18+', t)).toBe(
      'This student will be an adult at season start. Class: 18+.',
    );
    expect(enrolmentAgeMismatchMessage(7, '6–8', t)).toBe(
      'This student will be age 7 at season start. Class: 6–8.',
    );
  });

  it('formats inline student and search age lines', () => {
    expect(formatEnrolmentStudentAgeLine('1994-08-12', t)).toBe('Adult');
    expect(formatEnrolmentStudentAgeLine('2020-01-01', t)).toMatch(/^Age \d+$/);
    expect(formatPersonSearchAgeLine('1994-08-12', t)).toBe('Adult');
    expect(formatPersonSearchAgeLine('2020-01-01', t)).toMatch(/^Age \d+$/);
  });
});
