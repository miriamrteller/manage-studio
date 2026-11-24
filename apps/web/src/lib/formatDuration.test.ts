import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('English: hours and minutes in words', () => {
    expect(formatDuration(45, 'en')).toBe('45 min');
    expect(formatDuration(60, 'en')).toBe('1 hour');
    expect(formatDuration(90, 'en')).toBe('1 hour 30 min');
    expect(formatDuration(300, 'en')).toBe('5 hours');
  });

  it('Hebrew: natural forms', () => {
    expect(formatDuration(45, 'he')).toBe('45 דק׳');
    expect(formatDuration(60, 'he')).toBe('שעה');
    expect(formatDuration(90, 'he')).toBe('שעה וחצי');
    expect(formatDuration(120, 'he')).toBe('שעתיים');
    expect(formatDuration(150, 'he')).toBe('שעתיים וחצי');
    expect(formatDuration(240, 'he')).toBe('4 שעות');
    expect(formatDuration(75, 'he')).toBe('שעה ו-15 דק׳');
  });
});
