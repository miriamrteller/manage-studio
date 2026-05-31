import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import type { SortOrder } from '@/lib/list-query';
import { PersonService } from '@/features/people/service';
import { resolveEnrolledPersonIds } from '../lib/resolveEnrolledPersonIds';
import {
  DEFAULT_PERSON_SORT,
  type PersonSortField,
} from '../lib/personSort';
import type { Person } from '@shared/schemas';

const PAGE_SIZE = 50;

export interface StudentRow extends Person {
  classNames: string[];
  guardianName: string | null;
  guardianPhone: string | null;
}

interface UseStudentsOptions {
  page?: number;
  status?: 'active' | 'inactive' | 'all';
  classIds?: string[];
  categoryIds?: string[];
  accountIds?: string[];
  minAge?: number | null;
  maxAge?: number | null;
  searchQuery?: string;
  sortField?: PersonSortField;
  sortOrder?: SortOrder;
  enabled?: boolean;
}

export function useStudents({
  page = 1,
  status = 'active',
  classIds = [],
  categoryIds = [],
  accountIds = [],
  minAge = null,
  maxAge = null,
  searchQuery = '',
  sortField = DEFAULT_PERSON_SORT.field,
  sortOrder = DEFAULT_PERSON_SORT.order,
  enabled = true,
}: UseStudentsOptions = {}) {
  const tenant = useTenant();
  const hasEnrolmentFilter = classIds.length > 0 || categoryIds.length > 0;

  const enrolledIdsQuery = useQuery({
    queryKey: ['enrolled-person-ids', tenant?.id, classIds, categoryIds],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return resolveEnrolledPersonIds(tenant, { classIds, categoryIds });
    },
    enabled: enabled && !!tenant?.id && hasEnrolmentFilter,
  });

  const peopleQuery = useQuery({
    queryKey: [
      'students',
      tenant?.id,
      page,
      status,
      classIds,
      categoryIds,
      accountIds,
      minAge,
      maxAge,
      searchQuery,
      sortField,
      sortOrder,
    ],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');

      const enrolledPersonIds = hasEnrolmentFilter
        ? (enrolledIdsQuery.data ?? null)
        : null;

      if (hasEnrolmentFilter && enrolledPersonIds !== null && enrolledPersonIds.length === 0) {
        return { people: [], total: 0 };
      }

      const result = await PersonService.listWithFilters(tenant, {
        page,
        pageSize: PAGE_SIZE,
        status,
        searchQuery,
        accountIds,
        classIds,
        categoryIds,
        minAge,
        maxAge,
        sortField,
        sortOrder,
        enrolledPersonIds,
      });

      return { people: result.people, total: result.total };
    },
    enabled:
      enabled &&
      !!tenant?.id &&
      (!hasEnrolmentFilter || enrolledIdsQuery.isFetched),
  });

  return {
    students: peopleQuery.data?.people || [],
    total: peopleQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: peopleQuery.isLoading || (hasEnrolmentFilter && enrolledIdsQuery.isLoading),
    isFetching: peopleQuery.isFetching,
    error: peopleQuery.error,
  };
}
