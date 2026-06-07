import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type ExpandedState,
} from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useSortState } from '@/hooks/useSortState';
import { TenantDB } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import {
  AgeRangeFilter,
  FilterDrawer,
  FilterMultiSelect,
  FilterToolbar,
  SortableHeader,
  type ActiveFilterChip,
  type FilterOption,
} from '@/components/shared/table';
import { PersonSearch } from '@/features/people/components/PersonSearch';
import { FamilyMultiSelect } from '@/features/families/components/FamilyMultiSelect';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useStudents } from '../hooks/useStudents';
import { STUDENT_LIST_ENROLMENT_STATUSES } from '../lib/resolveEnrolledPersonIds';
import { DEFAULT_PERSON_SORT, type PersonSortField } from '../lib/personSort';
import { AdminEnrolStudentModal } from '@/features/enrolment/components/AdminEnrolStudentModal';
import { resolveGuardianEmail } from '@/features/enrolment/lib/resolveGuardianEmail';
import { ExpandedStudentRow } from './ExpandedStudentRow';
import { StudentSlideOver } from './StudentSlideOver';
import { getStudentAgeDisplay } from '@/lib/utils';
import type { Person } from '@shared/schemas';

const columnHelper = createColumnHelper<Person>();

type StatusFilter = 'active' | 'inactive' | 'all';

export function StudentsList() {
  const { t } = useTranslation();
  const { labels } = useEntityLabels();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classIdFromUrl = searchParams.get('class');
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedClasses, setSelectedClasses] = useState<FilterOption[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<FilterOption[]>([]);
  const [selectedFamilies, setSelectedFamilies] = useState<FilterOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minAge, setMinAge] = useState<number | null>(null);
  const [maxAge, setMaxAge] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [slideOverPersonId, setSlideOverPersonId] = useState<string | null>(null);
  const [enrolModalStudent, setEnrolModalStudent] = useState<{
    personId: string;
    personName: string;
    personDateOfBirth?: string | null;
    familyId?: string | null;
    guardianEmail?: string | null;
    guardianName?: string | null;
  } | null>(null);

  const { sortField, sortOrder, toggleSort } = useSortState<PersonSortField>(
    DEFAULT_PERSON_SORT.field,
    DEFAULT_PERSON_SORT.order
  );

  const { classes } = useClasses({ publicOnly: false });
  const { levels } = useLevels({ page: 1 });
  const { students, total, pageSize, isLoading, error } = useStudents({
    page,
    status: statusFilter,
    classIds: selectedClasses.map((c) => c.value),
    categoryIds: selectedLevels.map((l) => l.value),
    accountIds: selectedFamilies.map((f) => f.value),
    minAge,
    maxAge,
    searchQuery,
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
        .in('status', [...STUDENT_LIST_ENROLMENT_STATUSES]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && personIds.length > 0,
  });

  // Fetch families for students that have a account_id
  const accountIds = [...new Set(students.flatMap((s) => (s.account_id ? [s.account_id] : [])))];
  const familiesQuery = useQuery({
    queryKey: ['students-list-families', tenant?.id, accountIds],
    queryFn: async () => {
      if (!tenant || accountIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('accounts', tenant)
        .in('id', accountIds)
        .select('id, name, person_id, guardian:people!accounts_person_id_fkey(name, email, emergency_contact_phone)');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const guardian = row.guardian as {
          name?: string;
          email?: string | null;
          emergency_contact_phone?: string | null;
        } | null;
        return {
          id: row.id as string,
          contact_person_name: guardian?.name ?? null,
          contact_email: guardian?.email ?? null,
          contact_phone: guardian?.emergency_contact_phone ?? null,
        };
      });
    },
    enabled: !!tenant?.id && accountIds.length > 0,
  });

  // Fetch class names for the enrolments
  const classIds = [
    ...new Set((enrolmentsQuery.data ?? []).map((e: { offering_id: string }) => e.offering_id)),
  ];
  const classNamesQuery = useQuery({
    queryKey: ['students-list-class-names', tenant?.id, classIds],
    queryFn: async () => {
      if (!tenant || classIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('offerings', tenant).in('id', classIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && classIds.length > 0,
  });

  // Fetch contact_preferences for current page
  const contactPrefsQuery = useQuery({
    queryKey: ['students-list-contact-prefs', tenant?.id, personIds],
    queryFn: async () => {
      if (!tenant || personIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('contact_preferences', tenant).in(
        'person_id',
        personIds
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && personIds.length > 0,
  });

  // Build lookup maps
  const classNameMap = useMemo(
    () =>
      new Map<string, string>(
        (classNamesQuery.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
      ),
    [classNamesQuery.data]
  );
  const enrolmentsByPerson = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of enrolmentsQuery.data ?? []) {
      const existing = map.get(e.person_id) ?? [];
      const cn = classNameMap.get(e.offering_id);
      if (cn) existing.push(cn);
      map.set(e.person_id, existing);
    }
    return map;
  }, [enrolmentsQuery.data, classNameMap]);

  const familyMap = useMemo(
    () =>
      new Map<string, { contact_person_name: string | null; contact_phone: string | null; contact_email: string | null }>(
        (familiesQuery.data ?? []).map((f: { id: string; contact_person_name: string | null; contact_phone: string | null; contact_email: string | null }) => [f.id, f])
      ),
    [familiesQuery.data]
  );

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

  const contactPrefsMap = useMemo(
    () =>
      new Map<string, { preferred_channel: string; whatsapp_verified: boolean; whatsapp_number: string | null }>(
        (contactPrefsQuery.data ?? []).map(
          (cp: { person_id: string; preferred_channel: string; whatsapp_verified: boolean; whatsapp_number: string | null }) => [
            cp.person_id,
            cp,
          ]
        )
      ),
    [contactPrefsQuery.data]
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'expander',
        header: () => null,
        cell: ({ row }) => (
          <button
            onClick={row.getToggleExpandedHandler()}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label={row.getIsExpanded() ? t('common.close') : t('pages.students.expand_row')}
          >
            <svg
              className={`w-4 h-4 transition-transform ${row.getIsExpanded() ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ),
        size: 32,
      }),
      columnHelper.accessor('name', {
        header: t('pages.people.name_label'),
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('id', {
        id: 'classes',
        header: t('pages.students.classes_column'),
        cell: ({ row }) => {
          const names = enrolmentsByPerson.get(row.original.id) ?? [];
          if (names.length === 0) return <span className="text-gray-400 text-xs">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {names.map((n) => (
                <span
                  key={n}
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--color-info-light)',
                    color: 'var(--color-info)',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          );
        },
      }),
      columnHelper.accessor('date_of_birth', {
        header: t('pages.people.age_label'),
        cell: (info) => {
          const display = getStudentAgeDisplay(info.getValue());
          if (display.kind === 'adult') {
            return t('pages.students.age_adult');
          }
          if (display.kind === 'age') {
            return `${display.value}`;
          }
          return <span className="text-gray-400">—</span>;
        },
        size: 60,
      }),
      columnHelper.accessor('account_id', {
        id: 'guardian',
        header: t('pages.students.guardian_column'),
        cell: ({ row }) => {
          const fid = row.original.account_id;
          if (!fid) return <span className="text-gray-400 text-xs">—</span>;
          const family = familyMap.get(fid) as { contact_person_name: string | null } | undefined;
          return family?.contact_person_name ?? <span className="text-gray-400 text-xs">—</span>;
        },
      }),
      columnHelper.accessor('id', {
        id: 'notifications',
        header: t('pages.students.notifications_column'),
        cell: ({ row }) => {
          const cp = contactPrefsMap.get(row.original.id);
          if (!cp) return <span className="text-gray-400 text-xs">—</span>;
          const channel = cp.preferred_channel;
          if (channel === 'whatsapp') {
            return (
              <span className="flex items-center gap-1 text-xs text-green-700">
                💬 WhatsApp{cp.whatsapp_verified ? ' ✓' : ''}
              </span>
            );
          }
          return <span className="text-xs text-blue-700">✉ {t('pages.students.email_channel')}</span>;
        },
        size: 120,
      }),
      columnHelper.display({
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => openEnrolModal(row.original)}
            >
              {t('pages.students.enrol_button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSlideOverPersonId(row.original.id)}
            >
              {t('pages.students.details_button')}
            </Button>
          </div>
        ),
        size: 160,
      }),
    ],
    [t, enrolmentsByPerson, familyMap, contactPrefsMap, openEnrolModal]
  );

  const table = useReactTable({
    data: students,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.id,
  });

  const handleStatusFilter = (s: StatusFilter) => {
    setStatusFilter(s);
    setPage(1);
  };

  const handleSort = (field: PersonSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const resetPage = () => setPage(1);

  const classOptions = useMemo(
    () => classes.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
    [classes]
  );

  useEffect(() => {
    if (!classIdFromUrl || classOptions.length === 0) return;
    const match = classOptions.find((option) => option.value === classIdFromUrl);
    if (!match) return;
    setSelectedClasses((prev) =>
      prev.some((option) => option.value === match.value) ? prev : [match]
    );
  }, [classIdFromUrl, classOptions]);

  const levelOptions = useMemo(
    () => levels.map((l) => ({ value: l.id, label: l.name })),
    [levels]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'active') count++;
    count += selectedClasses.length;
    count += selectedLevels.length;
    count += selectedFamilies.length;
    if (minAge != null || maxAge != null) count++;
    return count;
  }, [statusFilter, selectedClasses, selectedLevels, selectedFamilies, minAge, maxAge]);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    const chips: ActiveFilterChip[] = [];
    if (statusFilter !== 'active') {
      chips.push({
        key: 'status',
        label: t(`pages.students.status_${statusFilter}`),
        onRemove: () => {
          setStatusFilter('active');
          resetPage();
        },
      });
    }
    for (const cls of selectedClasses) {
      chips.push({
        key: `class-${cls.value}`,
        label: cls.label,
        onRemove: () => {
          setSelectedClasses((prev) => prev.filter((c) => c.value !== cls.value));
          resetPage();
        },
      });
    }
    for (const level of selectedLevels) {
      chips.push({
        key: `level-${level.value}`,
        label: level.label,
        onRemove: () => {
          setSelectedLevels((prev) => prev.filter((l) => l.value !== level.value));
          resetPage();
        },
      });
    }
    for (const family of selectedFamilies) {
      chips.push({
        key: `family-${family.value}`,
        label: family.label,
        onRemove: () => {
          setSelectedFamilies((prev) => prev.filter((f) => f.value !== family.value));
          resetPage();
        },
      });
    }
    if (minAge != null || maxAge != null) {
      const parts = [];
      if (minAge != null) parts.push(`${t('common.filters.age_min')}: ${minAge}`);
      if (maxAge != null) parts.push(`${t('common.filters.age_max')}: ${maxAge}`);
      chips.push({
        key: 'age',
        label: parts.join(' – '),
        onRemove: () => {
          setMinAge(null);
          setMaxAge(null);
          resetPage();
        },
      });
    }
    return chips;
  }, [statusFilter, selectedClasses, selectedLevels, selectedFamilies, minAge, maxAge, t]);

  const handleClearAllFilters = () => {
    setStatusFilter('active');
    setSelectedClasses([]);
    setSelectedLevels([]);
    setSelectedFamilies([]);
    setMinAge(null);
    setMaxAge(null);
    resetPage();
  };

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
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilterChips}
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
          <Button variant="primary" onClick={() => navigate('/enrol', { state: { mode: 'admin', from: '/admin/students' } })}>
            {t('pages.students.enrol_new_button')}
          </Button>
        }
      />

      <FilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('common.filters.title')}
        activeCount={activeFilterCount}
        onClearAll={handleClearAllFilters}
      >
        <div className="space-y-1">
          <span className="block text-sm font-medium">{t('common.status')}</span>
          <div className="flex flex-wrap gap-2">
            {(['active', 'inactive', 'all'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t(`pages.students.status_${s}`)}
              </button>
            ))}
          </div>
        </div>

        {classes.length > 0 && (
          <FilterMultiSelect
            id="class-filter"
            label={t('pages.students.filter_by_class')}
            options={classOptions}
            selected={selectedClasses}
            onChange={(next) => {
              setSelectedClasses(next);
              resetPage();
            }}
          />
        )}

        <FamilyMultiSelect
          selected={selectedFamilies}
          onChange={(next) => {
            setSelectedFamilies(next);
            resetPage();
          }}
        />

        <FilterMultiSelect
          id="level-filter"
          label={t('pages.students.filter_by_level')}
          options={levelOptions}
          selected={selectedLevels}
          onChange={(next) => {
            setSelectedLevels(next);
            resetPage();
          }}
        />

        <AgeRangeFilter
          minAge={minAge}
          maxAge={maxAge}
          onMinChange={(v) => {
            setMinAge(v);
            resetPage();
          }}
          onMaxChange={(v) => {
            setMaxAge(v);
            resetPage();
          }}
          onClear={() => {
            setMinAge(null);
            setMaxAge(null);
            resetPage();
          }}
        />
      </FilterDrawer>

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
          onAction={() => navigate('/enrol', { state: { mode: 'admin', from: '/admin/students' } })}
        />
      )}

      {/* Table */}
      {students.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-3 py-3" style={{ width: 32 }} />
                <SortableHeader
                  label={t('pages.people.name_label')}
                  sortKey="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  className="px-3 py-3 text-start font-medium text-gray-700"
                />
                <th className="px-3 py-3 text-start font-medium text-gray-700">
                  {t('pages.students.classes_column')}
                </th>
                <SortableHeader
                  label={t('pages.people.age_label')}
                  sortKey="date_of_birth"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  className="px-3 py-3 text-start font-medium text-gray-700"
                />
                <th className="px-3 py-3 text-start font-medium text-gray-700">
                  {t('pages.students.guardian_column')}
                </th>
                <th className="px-3 py-3 text-start font-medium text-gray-700" style={{ width: 120 }}>
                  {t('pages.students.notifications_column')}
                </th>
                <th className="px-3 py-3" style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <>
                  <tr
                    key={row.id}
                    className="border-b hover:bg-gray-50 transition-colors"
                    style={{ borderColor: 'var(--color-border-default)' }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr key={`${row.id}-expanded`} className="bg-gray-50">
                      <td colSpan={columns.length} className="px-6 py-4">
                        <ExpandedStudentRow
                          person={row.original}
                          enrolmentsByPerson={enrolmentsByPerson}
                          familyMap={familyMap}
                          contactPrefsMap={contactPrefsMap}
                          onEnrol={openEnrolModal}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex justify-between items-center pt-2">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-gray-600">
            {t('common.page_n', { page })} — {t('common.showing_results', {
              count: Math.min(pageSize, total - (page - 1) * pageSize),
              total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * pageSize >= total}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      {/* Slide-over */}
      {slideOverPersonId && (
        <StudentSlideOver
          personId={slideOverPersonId}
          onClose={() => setSlideOverPersonId(null)}
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
