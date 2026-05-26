import { TenantDB } from '@/lib/db';
import type { Tenant } from '@shared/schemas';

const ACTIVE_ENROLMENT_STATUSES = ['active', 'pending_payment', 'waitlisted'] as const;

interface EnrolmentFilterOptions {
  classId?: string | null;
  levelId?: string | null;
}

/**
 * Resolve person IDs enrolled in classes matching classId and/or levelId.
 * Returns null when no enrolment filter is active.
 * Returns [] when filters apply but no matches exist.
 */
export async function resolveEnrolledPersonIds(
  tenant: Tenant,
  { classId, levelId }: EnrolmentFilterOptions
): Promise<string[] | null> {
  if (!classId && !levelId) return null;

  let classIds: string[] | null = null;

  if (levelId) {
    const { data, error } = await TenantDB.selectFor('classes', tenant)
      .eq('level_id', levelId)
      .select('id');
    if (error) throw error;
    classIds = (data || []).map((c: { id: string }) => c.id);
    if (classIds.length === 0) return [];
  }

  if (classId) {
    if (classIds === null) {
      classIds = [classId];
    } else {
      classIds = classIds.filter((id) => id === classId);
      if (classIds.length === 0) return [];
    }
  }

  const { data, error } = await TenantDB.selectFor('enrolments', tenant)
    .in('class_id', classIds!)
    .in('status', [...ACTIVE_ENROLMENT_STATUSES]);
  if (error) throw error;

  return [...new Set((data || []).map((e: { person_id: string }) => e.person_id))];
}
