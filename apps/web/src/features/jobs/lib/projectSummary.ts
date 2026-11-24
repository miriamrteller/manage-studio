import { useQuery } from '@tanstack/react-query';
import { JobPaymentService, type JobPaymentRequest } from '../services/jobPaymentService';
import type { QuoteSummary } from '@/features/quotes/services/quoteService';

const OPEN_REQUEST = new Set(['pending', 'sent']);

/** What is still to pay on a project: its payment requests that are not paid or cancelled. */
export function openAmountMinor(requests: readonly Pick<JobPaymentRequest, 'status' | 'amount_minor'>[]): number {
  return requests.filter((r) => OPEN_REQUEST.has(r.status)).reduce((sum, r) => sum + r.amount_minor, 0);
}

/** The newest quote for each project (a project can have a redone quote). */
export function latestQuoteByProject(quotes: readonly QuoteSummary[]): Map<string, QuoteSummary> {
  const map = new Map<string, QuoteSummary>();
  for (const quote of quotes) {
    if (!quote.engagement_id) continue;
    const seen = map.get(quote.engagement_id);
    if (!seen || seen.created_at < quote.created_at) map.set(quote.engagement_id, quote);
  }
  return map;
}

/** The payment requests of several projects, one query for all of them. */
export function useProjectRequests(engagementIds: string[]) {
  return useQuery({
    queryKey: ['project-requests', [...engagementIds].sort()],
    queryFn: () => JobPaymentService.listForEngagements(engagementIds),
    enabled: engagementIds.length > 0,
  });
}
