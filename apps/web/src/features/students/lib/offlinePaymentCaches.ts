import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything that shows a payment or an enrolment's paid state, so recording a
 * payment at the studio updates the Students list and Finance at once, not
 * after the 5-minute cache.
 */
export function offlinePaymentQueryKeys(tenantId: string | undefined, personId: string): unknown[][] {
  return [
    ['student-detail-payments', tenantId, personId],
    ['student-detail-enrolments', tenantId, personId],
    ['students', tenantId],
    ['students-list-enrolments', tenantId],
    ['finance-summary', tenantId],
    ['outstanding-engagements', tenantId],
    ['payments-log', tenantId],
  ];
}

export function invalidateAfterOfflinePayment(
  queryClient: QueryClient,
  tenantId: string | undefined,
  personId: string,
): void {
  for (const queryKey of offlinePaymentQueryKeys(tenantId, personId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
