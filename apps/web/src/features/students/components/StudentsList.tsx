import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  type ExpandedState,
} from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useDebounce } from '@/hooks/useDebounce';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useSortState } from '@/hooks/useSortState';
import { TenantDB } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { FilterToolbar } from '@/components/shared/table';
import { PersonSearch } from '@/features/people/components/PersonSearch';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useStudents } from '../hooks/useStudents';
import { useStudentListFilters } from '../hooks/useStudentListFilters';
import { useStudentsListLookups } from '../hooks/useStudentsListLookups';
import { STUDENT_LIST_DISPLAY_ENROLMENT_STATUSES } from '../lib/resolveEnrolledPersonIds';
import { DEFAULT_PERSON_SORT, type PersonSortField } from '../lib/personSort';
import { AdminEnrolStudentModal } from '@/features/enrolment/components/AdminEnrolStudentModal';
import { resolveGuardianEmail } from '@/features/enrolment/lib/resolveGuardianEmail';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { NEW_SHOOT_PATH, newShootState } from '@/features/jobs/lib/newShootRoute';
import type { JobRow } from '@/features/jobs/services/jobService';
import { StudentSlideOver } from './StudentSlideOver';
import { personPagePath } from '@/features/people/lib/personPagePath';
import { useStudentsListColumns } from './students-list/useStudentsListColumns';
import { StudentsFilterDrawer } from './students-list/StudentsFilterDrawer';
import { StudentsTable } from './students-list/StudentsTable';
import { StudentsPagination } from './students-list/StudentsPagination';
import type { Person } from '@shared/schemas';

export function StudentsList() {
  const { t } = useTranslation();
  const { labels, vertical } = useEntityLabels();
  // Photographers: this page is "Clients". Bookings are shoots (/admin/jobs),
  // so class/level/family/age/guardian UI and the /enrol flow don't apply.
  const isPhotographer = vertical === 'photographer';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classIdFromUrl = searchParams.get('class');
  const engagementIdFromUrl = searchParams.get('engagement');
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [slideOverPersonId, setSlideOverPersonId] = useState<string | null>(null);
  const [highlightEngagementId, setHighlightEngagementId] = useState<string | null>(null);
  const [enrolModalStudent, setEnrolModalStudent] = useState<{
    personId: string;
    personName: string;
    personDateOfBirth?: string | null;
    familyId?: string | null;
    guardianEmail?: string | null;
    guardianName?: string | null;
  } | null>(null);

  const resetPage = useCallback(() => setPage(1), []);

  const { sortField, sortOrder, toggleSort } = useSortState<PersonSortField>(
    DEFAULT_PERSON_SORT.field,
    DEFAULT_PERSON_SORT.order
  );

  const { classes } = useClasses({ publicOnly: false });
  const { levels } = useLevels({ page: 1 });
  const filters = useStudentListFilters({ classes, classIdFromUrl, resetPage });
  const {
    statusFilter,
    selectedClasses,
    selectedLevels,
    selectedEnrolmentStatuses,
    selectedFamilies,
    minAge,
    maxAge,
  } = filters;
  const { students, total, pageSize, isLoading, error } = useStudents({
    page,
    status: statusFilter,
    classIds: selectedClasses.map((c) => c.value),
    categoryIds: selectedLevels.map((l) => l.value),
    enrolmentStatuses: selectedEnrolmentStatuses.map((s) => s.value),
    accountIds: selectedFamilies.map((f) => f.value),
    minAge,
    maxAge,
    searchQuery: debouncedSearchQuery,
    sortField,
    sortOrder,
  });

  // Fetch enrolments for current page students + class names in one batch
  const personIds = students.map((s) => s.id);
  const enrolmentsQuery = useQuery({
    queryKey: ['students-list-enrolments', tenant?.id, personIds],
    queryFn: async () => {
      if (!tenant || personIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('engagements', tenant)
        .in('person_id', personIds)
        .in('status', [...STUDENT_LIST_DISPLAY_ENROLMENT_STATUSES]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && personIds.length > 0,
  });

  const { enrolmentsByPerson, familyMap, contactPrefsMap } = useStudentsListLookups({
    students,
    enrolments: enrolmentsQuery.data,
    enrolmentStatusFilterValues: selectedEnrolmentStatuses.map((s) => s.value),
  });

  const { jobs } = useJobs({ enabled: isPhotographer });
  const jobsByPerson = useMemo(() => {
    const map = new Map<string, JobRow[]>();
    for (const job of jobs) {
      const list = map.get(job.person_id) ?? [];
      list.push(job);
      map.set(job.person_id, list);
    }
    return map;
  }, [jobs]);

  const openNewShoot = useCallback(
    (person?: Person) =>
      navigate(NEW_SHOOT_PATH, {
        state: newShootState(person ? { id: person.id, name: person.name } : null),
      }),
    [navigate],
  );

  const openAddAction = () =>
    isPhotographer
      ? openNewShoot()
      : navigate('/enrol', { state: { mode: 'admin', from: '/admin/students' } });

  const openEnrolModal = useCallback((person: Person) => {
    const family = person.account_id ? familyMap.get(person.account_id) : undefined;
    setEnrolModalStudent({
      personId: person.id,
      personName: person.name,
      personDateOfBirth: person.date_of_birth,
      familyId: person.account_id,
      guardianEmail: resolveGuardianEmail({
        person,
        family: family ?? undefined,
      }),
      guardianName: family?.contact_person_name ?? null,
    });
  }, [familyMap]);

  const columns = useStudentsListColumns({
    isPhotographer,
    enrolmentsByPerson,
    familyMap,
    contactPrefsMap,
    jobsByPerson,
    openEnrolModal,
    openNewShoot,
    // A name opens the person's own page, with everything about them.
    openDetails: (personId: string) => navigate(personPagePath(personId)),
  });

  const table = useReactTable({
    data: students,
    columns,
    state: {
      expanded,
      // Photographer clients: no age ("Adult" for everyone) or guardian columns.
      columnVisibility: isPhotographer ? { date_of_birth: false, guardian: false } : {},
    },
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.id,
  });

  const handleSort = (field: PersonSortField) => {
    toggleSort(field, () => setPage(1));
  };

  useEffect(() => {
    if (!engagementIdFromUrl || !tenant?.id) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await TenantDB.selectFor('engagements', tenant)
        .select('person_id')
        .eq('id', engagementIdFromUrl)
        .maybeSingle();

      if (cancelled || error || !data?.person_id) return;

      setSlideOverPersonId(data.person_id as string);
      setHighlightEngagementId(engagementIdFromUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [engagementIdFromUrl, tenant]);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{labels.contact.plural}</h1>
        <p className="text-gray-600">{t('pages.students.description')}</p>
      </div>

      {/* Compact toolbar + collapsible filter drawer */}
      <FilterToolbar
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={filters.activeFilterCount}
        activeFilters={filters.activeFilterChips}
        searchSlot={
          <PersonSearch
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              resetPage();
            }}
            isSearching={isLoading}
          />
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/students/import')}>
              {t('clients_import.button')}
            </Button>
            <Button variant="primary" onClick={openAddAction}>
              {t('pages.students.enrol_new_button')}
            </Button>
          </div>
        }
      />

      <StudentsFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        isPhotographer={isPhotographer}
        hasClasses={classes.length > 0}
        levels={levels}
        resetPage={resetPage}
      />

      {/* Loading */}
      {isLoading && <div className="py-8 text-center text-gray-500">{t('common.loading')}</div>}

      {/* Error */}
      {error && (
        <div className="alert-error">
          {t('common.error')}: {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && students.length === 0 && (
        <EmptyState
          title={t('pages.students.empty_title')}
          message={t('pages.students.empty_message')}
          actionLabel={t('pages.students.enrol_new_button')}
          onAction={openAddAction}
        />
      )}

      {/* Table */}
      {students.length > 0 && (
        <StudentsTable
          table={table}
          isPhotographer={isPhotographer}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          enrolmentsByPerson={enrolmentsByPerson}
          familyMap={familyMap}
          contactPrefsMap={contactPrefsMap}
          jobsByPerson={jobsByPerson}
          onEnrol={isPhotographer ? openNewShoot : openEnrolModal}
        />
      )}

      {/* Pagination */}
      {total > pageSize && (
        <StudentsPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      )}

      {/* Slide-over */}
      {slideOverPersonId && (
        <StudentSlideOver
          personId={slideOverPersonId}
          highlightEngagementId={highlightEngagementId}
          onClose={() => {
            setSlideOverPersonId(null);
            setHighlightEngagementId(null);
          }}
        />
      )}

      {enrolModalStudent && (
        <AdminEnrolStudentModal
          isOpen={!!enrolModalStudent}
          personId={enrolModalStudent.personId}
          personName={enrolModalStudent.personName}
          personDateOfBirth={enrolModalStudent.personDateOfBirth}
          familyId={enrolModalStudent.familyId}
          guardianEmail={enrolModalStudent.guardianEmail}
          guardianName={enrolModalStudent.guardianName}
          onClose={() => setEnrolModalStudent(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['students', tenant?.id] });
          }}
        />
      )}
    </div>
  );
}
