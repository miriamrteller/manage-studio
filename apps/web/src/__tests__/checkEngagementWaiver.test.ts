import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveEnrolmentWaiverGate } from '@/features/enrolment/lib/checkEngagementWaiver';

vi.mock('@/lib/db', () => ({
  TenantDB: {
    selectFor: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    })),
  },
}));

const tenant = { id: '00000000-0000-0000-0000-000000000001' } as const;

describe('resolveEnrolmentWaiverGate (client baseline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not required when offering has no waiver', async () => {
    const { TenantDB } = await import('@/lib/db');
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };
    vi.mocked(TenantDB.selectFor).mockReturnValue(chain as never);

    chain.maybeSingle
      .mockResolvedValueOnce({ data: { waiver_required: false } })
      .mockResolvedValueOnce({ data: { name: 'Student', date_of_birth: '2015-01-01' } })
      .mockResolvedValueOnce({ data: { waiver_evidence_id: null } });

    const result = await resolveEnrolmentWaiverGate(tenant as never, {
      engagementId: '00000000-0000-0000-0000-000000000301',
      personId: '00000000-0000-0000-0000-000000000101',
      offeringId: '00000000-0000-0000-0000-000000000201',
    });

    expect(result.required).toBe(false);
  });
});
