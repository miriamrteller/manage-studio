export type { AdminDashboardOverview, AdminDashboardTodayClass } from '@shared/schemas';

/**
 * Calculate occupancy as a 0–100 integer percentage, capped at 100.
 * Returns 0 if capacity is zero (avoids division by zero).
 */
export const calcOccupancyPercent = (enrolled: number, capacity: number): number => {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((enrolled / capacity) * 100));
};
