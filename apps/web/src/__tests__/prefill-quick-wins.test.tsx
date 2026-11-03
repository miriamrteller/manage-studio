// @vitest-environment jsdom
/**
 * Prefill quick wins (owner rule: prefill what we already know, always editable):
 * class term and teacher, a lead's event date, a package's location and length,
 * an expense correction, local dates, the setup wizard's address and language,
 * a hand-added lead's follow-up and channel.
 * Run: pnpm -C apps/web test prefill-quick-wins.test.tsx
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultTeacherId, defaultTermId } from '@/features/classes/components/ClassForm';
import { eventDateToLocal } from '@/features/jobs/components/ConvertLeadPanel';
import { addMinutesLocal } from '@/features/jobs/lib/jobStatus';
import { localDateString } from '@/features/finance-admin/components/ExpenseForm';
import { defaultStudioLanguage, suggestSubdomain } from '@/features/platform/lib/studioSetupForm';
import { lastLeadChannel, rememberLeadChannel, tomorrowLocal } from '@/features/crm/lib/leadFormDefaults';

const term = (id: string, status: 'upcoming' | 'active' | 'completed' | 'archived', start_date: string) => ({ id, status, start_date });

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('a new class', () => {
  it('starts in the active term, else the next upcoming one, else the only one', () => {
    expect(defaultTermId([term('a', 'completed', '2025-09-01'), term('b', 'active', '2026-09-01')])).toBe('b');
    expect(
      defaultTermId([term('a', 'upcoming', '2027-09-01'), term('b', 'upcoming', '2026-09-01'), term('c', 'completed', '2025-09-01')]),
    ).toBe('b');
    expect(defaultTermId([term('a', 'completed', '2025-09-01')])).toBe('a');
    expect(defaultTermId([term('a', 'completed', '2024-09-01'), term('b', 'archived', '2025-09-01')])).toBe('');
    expect(defaultTermId([])).toBe('');
  });

  it('is the teacher’s when the studio has exactly one', () => {
    expect(defaultTeacherId([{ id: 't1' }])).toBe('t1');
    expect(defaultTeacherId([{ id: 't1' }, { id: 't2' }])).toBe('');
    expect(defaultTeacherId([])).toBe('');
  });
});

describe('shoots', () => {
  it('a lead’s event date becomes the start (10:00); free text stays blank', () => {
    expect(eventDateToLocal('2026-12-24')).toBe('2026-12-24T10:00');
    expect(eventDateToLocal('2026-12-24T18:00:00Z')).toBe('2026-12-24T10:00');
    expect(eventDateToLocal('next spring')).toBe('');
    expect(eventDateToLocal(null)).toBe('');
  });

  it('the end is the start plus the package length', () => {
    expect(addMinutesLocal('2026-12-24T10:00', 90)).toBe('2026-12-24T11:30');
    expect(addMinutesLocal('2026-12-24T23:30', 60)).toBe('2026-12-25T00:30');
    expect(addMinutesLocal('', 60)).toBe('');
    expect(addMinutesLocal('2026-12-24T10:00', null)).toBe('');
  });
});

describe('local dates', () => {
  it('today is the local date, not UTC (late evening in Israel was "yesterday")', () => {
    const lateEvening = new Date(2026, 10, 3, 23, 30);
    expect(localDateString(lateEvening)).toBe('2026-11-03');
    expect(tomorrowLocal(lateEvening)).toBe('2026-11-04');
    expect(tomorrowLocal(new Date(2026, 11, 31, 9, 0))).toBe('2027-01-01');
  });
});

describe('setup wizard', () => {
  it('suggests a web address from a Latin studio name', () => {
    expect(suggestSubdomain('Creative Ballet')).toBe('creative-ballet');
    expect(suggestSubdomain('  Café Dance & Yoga!! ')).toBe('cafe-dance-and-yoga');
    expect(suggestSubdomain('בלט יצירתי')).toBe('');
    expect(suggestSubdomain('Studio 54')).toBe('studio-54');
  });

  it('the studio language starts as the language in use', () => {
    expect(defaultStudioLanguage('he')).toBe('he');
    expect(defaultStudioLanguage('he-IL')).toBe('he');
    expect(defaultStudioLanguage('en')).toBe('en');
    expect(defaultStudioLanguage(undefined)).toBe('en');
  });
});

describe('a hand-added lead', () => {
  it('keeps the last channel the admin chose (this browser), else "website"', () => {
    expect(lastLeadChannel()).toBe('website');
    rememberLeadChannel('phone');
    expect(lastLeadChannel()).toBe('phone');
    window.localStorage.setItem('leads:last-manual-channel', 'not-a-channel');
    expect(lastLeadChannel()).toBe('website');
  });
});
