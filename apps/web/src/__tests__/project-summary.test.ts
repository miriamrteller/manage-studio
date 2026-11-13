import { describe, expect, it } from 'vitest';
import { latestQuoteByProject, openAmountMinor } from '@/features/jobs/lib/projectSummary';
import type { QuoteSummary } from '@/features/quotes/services/quoteService';

describe('still to pay on a project', () => {
  it('counts only requests that are not paid or cancelled', () => {
    expect(
      openAmountMinor([
        { status: 'pending', amount_minor: 30000 },
        { status: 'sent', amount_minor: 70000 },
        { status: 'paid', amount_minor: 50000 },
        { status: 'cancelled', amount_minor: 9999 },
        { status: 'refunded_manual', amount_minor: 1000 },
      ]),
    ).toBe(100000);
  });

  it('is 0 with no requests', () => {
    expect(openAmountMinor([])).toBe(0);
  });
});

describe('latest quote per project', () => {
  const quote = (id: string, engagement: string | null, created: string, status: QuoteSummary['status']) =>
    ({ id, engagement_id: engagement, created_at: created, status }) as QuoteSummary;

  it('keeps the newest quote of each project and skips quotes without one', () => {
    const map = latestQuoteByProject([
      quote('q1', 'e1', '2026-11-01T10:00:00Z', 'declined'),
      quote('q2', 'e1', '2026-11-05T10:00:00Z', 'accepted'),
      quote('q3', 'e2', '2026-11-02T10:00:00Z', 'sent'),
      quote('q4', null, '2026-11-09T10:00:00Z', 'draft'),
    ]);
    expect(map.get('e1')?.id).toBe('q2');
    expect(map.get('e2')?.id).toBe('q3');
    expect(map.size).toBe(2);
  });
});
