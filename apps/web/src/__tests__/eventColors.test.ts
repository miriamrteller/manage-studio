import { describe, it, expect } from 'vitest';
import { createScheduleColorResolver } from '@/features/scheduling/lib/eventColors';
import { darkenColor } from '@/lib/utils';

const classEvent = {
  event_type: 'class' as const,
  offering_id: 'offering-1',
  id: 'evt-1',
  starts_at: '2026-08-24T13:30:00Z',
};

describe('createScheduleColorResolver', () => {
  it('gives class events a border that is a darker shade of their background, not black', () => {
    const resolve = createScheduleColorResolver([classEvent]);
    const color = resolve(classEvent);
    expect(color.border).toBe(darkenColor(color.background, 0.14));
    expect(color.border).not.toBe('#000000');
    // Still darker than the background on every channel.
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (const i of [0, 1, 2]) {
      expect(channel(color.border, i)).toBeLessThanOrEqual(channel(color.background, i));
    }
  });

  it('keeps blocked time on the neutral grey pair', () => {
    const resolve = createScheduleColorResolver([]);
    const color = resolve({ event_type: 'blocked', offering_id: null, id: 'evt-2' });
    expect(color).toEqual({ background: '#9ca3af', border: '#6b7280', text: '#ffffff' });
  });
});
