/**
 * G1: admin offline payment must go through the record-payment edge function
 * (canonical finalise + document enqueue), never a direct payments insert.
 * Run: pnpm -C apps/web test admin-offline-payment.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminEnrolmentService } from '@/features/enrolment/lib/adminEnrolmentService';

const mockInvoke = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe('AdminEnrolmentService.recordOfflinePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { paymentId: 'pay-1' }, error: null });
  });

  it('invokes the record-payment edge function with engagement and method', async () => {
    const result = await AdminEnrolmentService.recordOfflinePayment('eng-1', 'cash');

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('record-payment', {
      body: { engagement_id: 'eng-1', method: 'cash', note: undefined },
    });
    expect(result).toEqual({ paymentId: 'pay-1' });
  });

  it('passes a note when provided', async () => {
    await AdminEnrolmentService.recordOfflinePayment('eng-2', 'bank_transfer', 'paid in office');

    expect(mockInvoke).toHaveBeenCalledWith('record-payment', {
      body: { engagement_id: 'eng-2', method: 'bank_transfer', note: 'paid in office' },
    });
  });

  it('throws when the edge function returns an error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'tenant_admin role required' } });

    await expect(AdminEnrolmentService.recordOfflinePayment('eng-3', 'cash')).rejects.toThrow(
      'tenant_admin role required',
    );
  });

  it('throws when the edge function returns a body error', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Payment already recorded' }, error: null });

    await expect(AdminEnrolmentService.recordOfflinePayment('eng-4', 'cash')).rejects.toThrow(
      'Payment already recorded',
    );
  });
});
