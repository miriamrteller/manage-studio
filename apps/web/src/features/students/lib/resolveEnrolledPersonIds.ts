import { TenantDB } from '@/lib/db';
import type { Tenant } from '@shared/schemas';

const ACTIVE_ENROLMENT_STATUSES = ['active', 'pending_payment', 'waitlisted'] as const;

interface EnrolmentFilterOptions {
  classIds?: string[];
  levelIds?: string[];
}

/**
 * Resolve person IDs enrolled in classes matching classIds and/or levelIds.
 * When both are set, classes must satisfy both (intersection).
 * Returns null when no enrolment filter is active.
 */
export async function resolveEnrolledPersonIds(
  tenant: Tenant,
  { classIds = [], levelIds = [] }: EnrolmentFilterOptions
): Promise<string[] | null> {
  if (classIds.length === 0 && levelIds.length === 0) return null;

  let matchingClassIds: string[] | null = null;

  if (levelIds.length > 0) {
    const { data, error } = await TenantDB.selectFor('classes', tenant)
      .in('level_id', levelIds)
      .select('id');
    if (error) throw error;
    matchingClassIds = (data || []).map((c: { id: string }) => c.id);
    if (matchingClassIds.length === 0) return [];
  }

  if (classIds.length > 0) {
    if (matchingClassIds === null) {
      matchingClassIds = [...classIds];
    } else {
      matchingClassIds = matchingClassIds.filter((id) => classIds.includes(id));
      if (matchingClassIds.length === 0) return [];
    }
  }

  const { data, error } = await TenantDB.selectFor('enrolments', tenant)
    .in('class_id', matchingClassIds!)
    .in('status', [...ACTIVE_ENROLMENT_STATUSES]);
  if (error) throw error;

  return [...new Set((data || []).map((e: { person_id: string }) => e.person_id))];
}
