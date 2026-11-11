import { describe, expect, it } from 'vitest';
import { blockRange, formatBlock, jerusalemToIso } from '@/features/scheduling/lib/blockTimes';

describe('blocked times in Israel time', () => {
  it('turns Israel local time into UTC (winter +2, summer +3)', () => {
    expect(jerusalemToIso('2026-11-15', '10:00')).toBe('2026-11-15T08:00:00.000Z');
    expect(jerusalemToIso('2026-07-12', '10:00')).toBe('2026-07-12T07:00:00.000Z');
  });

  it('an all-day block runs from midnight to the next midnight', () => {
    expect(blockRange({ fromDate: '2026-11-15', toDate: '2026-11-15', allDay: true, fromTime: '', toTime: '' })).toEqual({
      start_time: '2026-11-14T22:00:00.000Z',
      end_time: '2026-11-15T22:00:00.000Z',
    });
  });

  it('a block over several days ends the night after the last day', () => {
    expect(blockRange({ fromDate: '2026-11-15', toDate: '2026-11-17', allDay: true, fromTime: '', toTime: '' })?.end_time).toBe(
      '2026-11-17T22:00:00.000Z',
    );
  });

  it('refuses an end before the start', () => {
    expect(blockRange({ fromDate: '2026-11-15', toDate: '2026-11-15', allDay: false, fromTime: '12:00', toTime: '10:00' })).toBeNull();
    expect(blockRange({ fromDate: '2026-11-15', toDate: '2026-11-14', allDay: true, fromTime: '', toTime: '' })).toBeNull();
  });

  it('shows a whole day without times, and a part day with times', () => {
    const day = blockRange({ fromDate: '2026-11-15', toDate: '2026-11-15', allDay: true, fromTime: '', toTime: '' })!;
    expect(formatBlock(day.start_time, day.end_time, 'en-GB')).toBe('Sun 15 Nov');
    const part = blockRange({ fromDate: '2026-11-15', toDate: '2026-11-15', allDay: false, fromTime: '10:00', toTime: '12:00' })!;
    expect(formatBlock(part.start_time, part.end_time, 'en-GB')).toBe('Sun 15 Nov, 10:00 – 12:00');
  });
});
