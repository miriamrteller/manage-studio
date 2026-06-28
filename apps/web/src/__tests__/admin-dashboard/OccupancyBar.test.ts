import { describe, it, expect } from 'vitest';
import { calcOccupancyPercent } from '@/features/admin-dashboard/types';

describe('calcOccupancyPercent', () => {
  it('returns 0 for zero capacity (avoids division by zero)', () => {
    expect(calcOccupancyPercent(5, 0)).toBe(0);
  });

  it('calculates percentage correctly', () => {
    expect(calcOccupancyPercent(8, 12)).toBe(67); // 66.67 → rounds to 67
    expect(calcOccupancyPercent(15, 15)).toBe(100);
    expect(calcOccupancyPercent(0, 10)).toBe(0);
  });

  it('caps at 100 even when enrolled exceeds capacity', () => {
    expect(calcOccupancyPercent(18, 12)).toBe(100);
    expect(calcOccupancyPercent(20, 15)).toBe(100);
  });

  it('handles exactly full class', () => {
    expect(calcOccupancyPercent(12, 12)).toBe(100);
  });

  it('rounds correctly', () => {
    expect(calcOccupancyPercent(1, 3)).toBe(33); // 33.33 → 33
    expect(calcOccupancyPercent(2, 3)).toBe(67); // 66.67 → 67
  });
});
