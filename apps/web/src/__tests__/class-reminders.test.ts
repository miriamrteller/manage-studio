/**
 * Automatic class emails (tenants.class_reminders, run-class-reminders):
 * which days are class days, which are off (holidays + the studio's closed
 * dates), explicit sessions always count, and the email wording.
 * Run: pnpm -C apps/web test class-reminders
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  classOnDate,
  formatTime,
  morningReminderEmail,
  noClassEmail,
  parseClassReminders,
  weekdayOf,
  type ReminderOffering,
} from '../../../../supabase/functions/_shared/class-reminders.ts';
import { parseClassRemindersSetting } from '@/features/notifications-admin/components/ClassRemindersSetting';

const wednesday: ReminderOffering = {
  id: 'o-1',
  name: 'Grades 1–2',
  day_of_week: 3,
  start_time: '16:30:00',
  end_time: '17:15:00',
  location: 'Abarbanel 23, top floor',
  season_start: '2026-12-16',
  season_end: '2027-04-14',
};
const off = (dates: string[]) => (d: string) => dates.includes(d);

describe('parseClassReminders', () => {
  it('off by default; keeps valid closed dates only, sorted and unique', () => {
    expect(parseClassReminders(null)).toEqual({ morning: false, no_class: false, wear_en: '', wear_he: '', closed_dates: [] });
    expect(parseClassReminders({ morning: true, closed_dates: ['2027-03-24', 'nope', '2027-01-06', '2027-03-24'] })).toMatchObject({
      morning: true,
      closed_dates: ['2027-01-06', '2027-03-24'],
    });
  });
  it('the settings card reads the same shape', () => {
    expect(parseClassRemindersSetting({ no_class: true, closed_dates: ['2027-03-24', 'x'] })).toEqual({
      morning: false,
      no_class: true,
      wear_en: '',
      wear_he: '',
      closed_dates: ['2027-03-24'],
    });
  });
});

describe('classOnDate', () => {
  it('a Wednesday in the season is a class day', () => {
    expect(weekdayOf('2026-12-16')).toBe(3);
    expect(classOnDate(wednesday, '2026-12-16', [], off([]))).toEqual({
      occurrence: { offering: wednesday, start_time: '16:30:00', end_time: '17:15:00' },
      off: false,
    });
  });
  it('other weekdays and dates outside the season are not', () => {
    expect(classOnDate(wednesday, '2026-12-17', [], off([]))).toBeNull();
    expect(classOnDate(wednesday, '2026-12-09', [], off([]))).toBeNull();
    expect(classOnDate(wednesday, '2027-04-21', [], off([]))).toBeNull();
  });
  it('a closed date or holiday is a class day that is off', () => {
    expect(classOnDate(wednesday, '2027-03-24', [], off(['2027-03-24']))?.off).toBe(true);
  });
  it('an explicit session always counts, at its own time', () => {
    const session = { offering_id: 'o-1', session_date: '2027-03-24', start_time: '10:00:00', end_time: '11:00:00' };
    expect(classOnDate(wednesday, '2027-03-24', [session], off(['2027-03-24']))).toMatchObject({
      occurrence: { start_time: '10:00:00' },
      off: false,
    });
  });
  it('a week ahead', () => {
    expect(addDays('2027-03-17', 7)).toBe('2027-03-24');
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
  });
});

describe('emails', () => {
  const base = {
    parentName: 'Dana Levi',
    studentName: 'Noa Levi',
    className: 'Grades 1–2',
    date: '2026-12-16',
    startTime: '16:30:00',
    endTime: '17:15:00',
    location: 'Abarbanel 23, top floor',
    wear: 'Leotard and tights',
    studio: 'Creative Ballet Academy',
  };
  it('morning reminder (English) has the time, where and what to wear', () => {
    const e = morningReminderEmail({ ...base, lang: 'en' });
    expect(e.subject).toBe('Reminder: Grades 1–2 today at 4:30');
    expect(e.body).toContain("Hi Dana,");
    expect(e.body).toContain("Noa's class (Grades 1–2) is today at 4:30–5:15.");
    expect(e.body).toContain('Where: Abarbanel 23, top floor');
    expect(e.body).toContain('What to wear: Leotard and tights');
  });
  it('morning reminder (Hebrew) uses 24-hour times', () => {
    const e = morningReminderEmail({ ...base, lang: 'he' });
    expect(e.subject).toBe('תזכורת: Grades 1–2 היום ב-16:30');
    expect(e.body).toContain('16:30–17:15');
    expect(e.body).toContain('איפה: Abarbanel 23, top floor');
  });
  it('leaves out where / what to wear when not set', () => {
    const e = morningReminderEmail({ ...base, lang: 'en', location: null, wear: '' });
    expect(e.body).not.toContain('Where:');
    expect(e.body).not.toContain('What to wear:');
  });
  it('no-class notice names the day', () => {
    expect(noClassEmail({ ...base, date: '2027-03-24', lang: 'en' })).toEqual({
      subject: 'No class on Wednesday 24 March',
      body: "Hi Dana,\n\nJust so you know, there's no Grades 1–2 class on Wednesday 24 March.\n\nCreative Ballet Academy",
    });
    expect(noClassEmail({ ...base, date: '2027-03-24', lang: 'he' }).subject).toContain('24 במרץ');
  });
  it('formatTime', () => {
    expect(formatTime('12:00:00', 'en')).toBe('12:00');
    expect(formatTime('09:05:00', 'he')).toBe('09:05');
  });
});
