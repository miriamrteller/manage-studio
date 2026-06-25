import { describe, it, expect } from 'vitest';
import { AdminDashboardOverviewSchema } from '@shared/schemas';

const mockOverviewData = {
  season_id: '123e4567-e89b-12d3-a456-426614174000',
  season_name: 'Fall 2024',
  today_classes: [
    {
      id: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Morning Yoga',
      start_time: '09:00:00',
      end_time: '10:00:00',
      location: 'Studio A',
      max_capacity: 12,
      enrolled_count: 8,
      waitlist_count: 2,
      staff_name: 'Sarah Cohen',
    },
    {
      id: '123e4567-e89b-12d3-a456-426614174002',
      name: 'Evening Pilates',
      start_time: '18:00:00',
      end_time: '19:00:00',
      location: 'Studio B',
      max_capacity: 15,
      enrolled_count: 15,
      waitlist_count: 5,
      staff_name: 'David Levy',
    },
  ],
  term_enrolments_count: 45,
  admin_review_count: 3,
  pending_payment_count: 7,
  finance: {
    net_revenue_minor: 234000,
    payment_count: 52,
    outstanding_engagements: 7,
    failed_payments_7d: 1,
    net_expenses_minor: 10000,
  },
};

const mockEmptyOverview = {
  season_id: null,
  season_name: null,
  today_classes: [],
  term_enrolments_count: 0,
  admin_review_count: 0,
  pending_payment_count: 0,
  finance: {
    net_revenue_minor: 0,
    payment_count: 0,
    outstanding_engagements: 0,
    failed_payments_7d: 0,
    net_expenses_minor: 0,
  },
};

describe('AdminDashboardOverviewSchema', () => {
  it('parses valid overview data', () => {
    const result = AdminDashboardOverviewSchema.parse(mockOverviewData);
    expect(result.season_id).toBe(mockOverviewData.season_id);
    expect(result.today_classes).toHaveLength(2);
    expect(result.term_enrolments_count).toBe(45);
    expect(result.finance.net_revenue_minor).toBe(234000);
  });

  it('parses empty / no-season overview', () => {
    const result = AdminDashboardOverviewSchema.parse(mockEmptyOverview);
    expect(result.season_id).toBeNull();
    expect(result.today_classes).toHaveLength(0);
  });

  it('rejects invalid enrolled_count type', () => {
    const bad = {
      ...mockOverviewData,
      today_classes: [
        { ...mockOverviewData.today_classes[0], enrolled_count: 'invalid' },
      ],
    };
    expect(() => AdminDashboardOverviewSchema.parse(bad)).toThrow();
  });

  it('rejects negative enrolled_count', () => {
    const bad = {
      ...mockOverviewData,
      today_classes: [
        { ...mockOverviewData.today_classes[0], enrolled_count: -1 },
      ],
    };
    expect(() => AdminDashboardOverviewSchema.parse(bad)).toThrow();
  });

  it('rejects zero max_capacity', () => {
    const bad = {
      ...mockOverviewData,
      today_classes: [
        { ...mockOverviewData.today_classes[0], max_capacity: 0 },
      ],
    };
    expect(() => AdminDashboardOverviewSchema.parse(bad)).toThrow();
  });

  it('allows location to be null', () => {
    const withNullLocation = {
      ...mockOverviewData,
      today_classes: [
        { ...mockOverviewData.today_classes[0], location: null },
      ],
    };
    const result = AdminDashboardOverviewSchema.parse(withNullLocation);
    expect(result.today_classes[0].location).toBeNull();
  });

  it('validates time format HH:MM:SS', () => {
    const badTime = {
      ...mockOverviewData,
      today_classes: [
        { ...mockOverviewData.today_classes[0], start_time: '9:00' },
      ],
    };
    expect(() => AdminDashboardOverviewSchema.parse(badTime)).toThrow();
  });
});
