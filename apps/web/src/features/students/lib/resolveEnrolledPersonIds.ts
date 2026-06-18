import { TenantDB } from '@/lib/db';
import { NON_TERMINAL_ENGAGEMENT_STATUSES } from '@/features/enrolment/lib/enrolmentTransitions';
import type { Tenant } from '@shared/schemas';

/** Non-terminal engagement statuses used for student-list enrolment scope. */
export const STUDENT_LIST_ENROLMENT_STATUSES = NON_TERMINAL_ENGAGEMENT_STATUSES;

/** Includes post-payment waiver pending — shown in lists and student scope. */
export const STUDENT_LIST_DISPLAY_ENROLMENT_STATUSES = [
  ...NON_TERMINAL_ENGAGEMENT_STATUSES,
  'pending_waiver',
] as const;

const GUARDIAN_ACCOUNT_MEMBER_ROLES = ['account_holder', 'member'] as const;

interface EngagementFilterOptions {
  classIds?: string[];
  categoryIds?: string[];
  enrolmentStatuses?: string[];
}

/**
 * Resolve person IDs enrolled in classes matching classIds and/or categoryIds.
 * When both are set, classes must satisfy both (intersection).
 * Returns null when no enrolment filter is active.
 */
export async function resolveEnrolledPersonIds(
  tenant: Tenant,
  { classIds = [], categoryIds = [], enrolmentStatuses = [] }: EngagementFilterOptions
): Promise<string[] | null> {
  if (classIds.length === 0 && categoryIds.length === 0 && enrolmentStatuses.length === 0) {
    return null;
  }

  const statuses =
    enrolmentStatuses.length > 0
      ? enrolmentStatuses
      : [...STUDENT_LIST_DISPLAY_ENROLMENT_STATUSES];

  let matchingClassIds: string[] | null = null;

  if (categoryIds.length > 0) {
    const { data, error } = await TenantDB.selectFor('offerings', tenant)
      .in('category_id', categoryIds)
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

  let engagementQuery = TenantDB.selectFor('engagements', tenant).in('status', statuses);
  if (matchingClassIds !== null) {
    engagementQuery = engagementQuery.in('offering_id', matchingClassIds);
  }

  const { data, error } = await engagementQuery;
  if (error) throw error;

  return [...new Set((data || []).map((e: { person_id: string }) => e.person_id))];
}

/** Person IDs with any active enrolment (for student-list scope). */
export async function resolveAllEnrolledPersonIds(tenant: Tenant): Promise<string[]> {
  const { data, error } = await TenantDB.selectFor('engagements', tenant)
    .in('status', [...STUDENT_LIST_DISPLAY_ENROLMENT_STATUSES])
    .select('person_id');
  if (error) throw error;

  return [...new Set((data || []).map((e: { person_id: string }) => e.person_id))];
}

/** Primary and secondary guardians — excluded from the student list. */
export async function resolveGuardianPersonIds(tenant: Tenant): Promise<string[]> {
  const ids = new Set<string>();

  const { data: accounts, error: accountsError } = await TenantDB.selectFor('accounts', tenant).select(
    'person_id'
  );
  if (accountsError) throw accountsError;
  for (const row of accounts ?? []) {
    if (row.person_id) ids.add(row.person_id as string);
  }

  const { data: members, error: membersError } = await TenantDB.selectFor('account_members', tenant)
    .in('role', [...GUARDIAN_ACCOUNT_MEMBER_ROLES])
    .select('person_id');
  if (membersError) throw membersError;
  for (const row of members ?? []) {
    if (row.person_id) ids.add(row.person_id as string);
  }

  return [...ids];
}

/** Adult solo students: active people with no family account who are not guardians. */
export async function resolveSoloStudentPersonIds(
  tenant: Tenant,
  guardianPersonIds: string[]
): Promise<string[]> {
  let query = TenantDB.selectFor('people', tenant)
    .is('account_id', null)
    .eq('status', 'active')
    .select('id');

  if (guardianPersonIds.length > 0) {
    query = query.not('id', 'in', `(${guardianPersonIds.join(',')})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: { id: string }) => row.id);
}

/** Extra person IDs included in student-list scope beyond family-linked students. */
export function mergeStudentListScopeIds(
  enrolledPersonIds: string[],
  soloStudentPersonIds: string[]
): string[] {
  return [...new Set([...enrolledPersonIds, ...soloStudentPersonIds])];
}
