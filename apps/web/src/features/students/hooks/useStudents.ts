import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import { PersonSchema, type Person } from '@shared/schemas';

const PAGE_SIZE = 50;

export interface StudentRow extends Person {
  /** Class names the student is currently enrolled in (active enrolments only) */
  classNames: string[];
  /** Guardian name from family, if person has a family_id */
  guardianName: string | null;
  /** Guardian phone from family */
  guardianPhone: string | null;
}

interface UseStudentsOptions {
  page?: number;
  status?: 'active' | 'inactive' | 'all';
  classId?: string | null;
  searchQuery?: string;
  enabled?: boolean;
}

/**
 * useStudents: Main list hook for the Students admin page.
 *
 * Fetches people with optional filters:
 * - status: active (default) / inactive / all
 * - classId: only people enrolled in this class
 * - searchQuery: name ilike filter
 *
 * Returns enriched StudentRow objects with classNames and guardianName
 * resolved client-side from parallel lookups.
 */
export function useStudents({
  page = 1,
  status = 'active',
  classId = null,
  searchQuery = '',
  enabled = true,
}: UseStudentsOptions = {}) {
  const tenant = useTenant();

  // Step 1: if classId is set, resolve person_ids enrolled in that class
  const enrolledIdsQuery = useQuery({
    queryKey: ['enrolled-person-ids', tenant?.id, classId],
    queryFn: async () => {
      if (!tenant || !classId) return null;
      const { data, error } = await TenantDB.selectFor('enrolments', tenant)
        .eq('class_id', classId)
        .in('status', ['active', 'pending_payment', 'waitlisted']);
      if (error) throw error;
      return (data || []).map((e: { person_id: string }) => e.person_id);
    },
    enabled: enabled && !!tenant?.id && !!classId,
  });

  const from = (page - 1) * PAGE_SIZE;

  // Step 2: fetch people, applying filters
  const peopleQuery = useQuery({
    queryKey: ['students', tenant?.id, page, status, classId, searchQuery],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');

      // If filtering by class and enrolled IDs resolved to empty, bail early
      if (classId && enrolledIdsQuery.data !== null && enrolledIdsQuery.data?.length === 0) {
        return { people: [], total: 0 };
      }

      let query = TenantDB.selectFor('people', tenant, { count: 'exact' })
        .order('name', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }
      if (classId && enrolledIdsQuery.data && enrolledIdsQuery.data.length > 0) {
        query = query.in('id', enrolledIdsQuery.data);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        people: (data || []).map((p: unknown) => PersonSchema.parse(p)),
        total: count || 0,
      };
    },
    enabled: enabled && !!tenant?.id && (!classId || enrolledIdsQuery.isFetched),
  });

  return {
    students: peopleQuery.data?.people || [],
    total: peopleQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: peopleQuery.isLoading || (!!classId && enrolledIdsQuery.isLoading),
    isFetching: peopleQuery.isFetching,
    error: peopleQuery.error,
  };
}
