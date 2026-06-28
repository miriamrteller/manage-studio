import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AdminDashboardService,
  NoActiveSeasonError,
} from '@/features/admin-dashboard/services/adminDashboardService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

const mockRpc = vi.mocked(supabase.rpc);

const validData = {
  season_id: '123e4567-e89b-12d3-a456-426614174000',
  season_name: 'Fall 2024',
  today_classes: [],
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

describe('AdminDashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOverview', () => {
    it('maps P0001 error code to NoActiveSeasonError', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'No active season found for this tenant' },
      } as any);
      await expect(AdminDashboardService.getOverview()).rejects.toThrow(NoActiveSeasonError);
    });

    it('throws original error for non-P0001 supabase errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: 'PGRST500', message: 'Database connection failed' },
      } as any);
      await expect(AdminDashboardService.getOverview()).rejects.toBeTruthy();
    });

    it('returns parsed AdminDashboardOverview on success', async () => {
      mockRpc.mockResolvedValue({ data: validData, error: null } as any);
      const result = await AdminDashboardService.getOverview();
      expect(result.season_id).toBe(validData.season_id);
      expect(result.term_enrolments_count).toBe(45);
      expect(result.finance.net_revenue_minor).toBe(234000);
    });

    it('throws schema validation error when data shape is invalid', async () => {
      const invalidData = { ...validData, term_enrolments_count: 'not-a-number' };
      mockRpc.mockResolvedValue({ data: invalidData, error: null } as any);
      await expect(AdminDashboardService.getOverview()).rejects.toThrow();
    });
  });

  describe('NoActiveSeasonError', () => {
    it('has correct name and code properties', () => {
      const error = new NoActiveSeasonError();
      expect(error.name).toBe('NoActiveSeasonError');
      expect(error.code).toBe('NO_ACTIVE_SEASON');
    });

    it('is an instance of Error', () => {
      const error = new NoActiveSeasonError();
      expect(error).toBeInstanceOf(Error);
    });

    it('uses default message when none provided', () => {
      const error = new NoActiveSeasonError();
      expect(error.message).toBe('No active season found for this tenant');
    });
  });
});
