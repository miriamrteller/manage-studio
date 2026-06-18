import type { TFunction } from 'i18next';
import type { FilterOption } from '@/components/shared/table';
import type { Engagement } from '@shared/schemas';

/** Enrolment statuses available in list / portal filters. */
export const FILTERABLE_ENROLMENT_STATUSES = [
  'pending_payment',
  'pending_waiver',
  'admin_review',
  'pending_offer',
  'active',
] as const;

export type FilterableEnrolmentStatus = (typeof FILTERABLE_ENROLMENT_STATUSES)[number];

export function getEnrolmentStatusFilterOptions(t: TFunction): FilterOption[] {
  return FILTERABLE_ENROLMENT_STATUSES.map((status) => ({
    value: status,
    label: t(`pages.portal.enrolment_status.${status}`, status),
  }));
}

export function filterEnrolmentsByStatus<T extends { status: Engagement['status'] }>(
  enrolments: T[],
  selectedStatuses: string[],
): T[] {
  if (selectedStatuses.length === 0) return enrolments;
  const allowed = new Set(selectedStatuses);
  return enrolments.filter((entry) => allowed.has(entry.status));
}

export interface StudentEnrolmentSummary {
  id: string;
  offeringId: string;
  className: string;
  status: Engagement['status'];
}
