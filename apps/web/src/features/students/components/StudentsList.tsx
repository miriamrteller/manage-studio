import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type ExpandedState,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useSortState } from '@/hooks/useSortState';
import { TenantDB } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import {
  AgeRangeFilter,
  FilterSelect,
  SortableHeader,
} from '@/components/shared/table';
import { PersonSearch } from '@/features/people/components/PersonSearch';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useFamilies } from '@/features/families/hooks/useFamilies';
import { useStudents } from '../hooks/useStudents';
import { DEFAULT_PERSON_SORT, type PersonSortField } from '../lib/personSort';
import { ExpandedStudentRow } from './ExpandedStudentRow';
import { StudentSlideOver } from './StudentSlideOver';
import { calculateAge } from '@/lib/utils';
import type { Person } from '@shared/schemas';

const columnHelper = createColumnHelper<Person>();

type StatusFilter = 'active' | 'inactive' | 'all';

export function StudentsList() {
  const { t } = useTranslation();
  const tenant = useTenant();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [minAge, setMinAge] = useState<number | null>(null);
  const [maxAge, setMaxAge] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [slideOverPersonId, setSlideOverPersonId] = useState<string | null>(null);

  const { sortField, sortOrder, toggleSort } = useSortState<PersonSortField>(
    DEFAULT_PERSON_SORT.field,
    DEFAULT_PERSON_SORT.order
  );

  const { classes } = useClasses({ publicOnly: false });
  const { levels } = useLevels({ page: 1 });
  const { families } = useFamilies({ page: 1, pageSize: 200 });
  const { students, total, pageSize, isLoading, error } = useStudents({
    page,
    status: statusFilter,
    classId: selectedClassId,
    levelId: selectedLevelId,
    familyId: selectedFamilyId,
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
      const { data, error } = await TenantDB.selectFor('enrolments', tenant)
        .in('person_id', personIds)
        .in('status', ['active', 'pending_payment', 'waitlisted']);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && personIds.length > 0,
  });

  // Fetch families for students that have a family_id
  const familyIds = [...new Set(students.flatMap((s) => (s.family_id ? [s.family_id] : [])))];
  const familiesQuery = useQuery({
    queryKey: ['students-list-families', tenant?.id, familyIds],
    queryFn: async () => {
      if (!tenant || familyIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('families', tenant).in('id', familyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && familyIds.length > 0,
  });

  // Fetch class names for the enrolments
  const classIds = [
    ...new Set((enrolmentsQuery.data ?? []).map((e: { class_id: string }) => e.class_id)),
  ];
  const classNamesQuery = useQuery({
    queryKey: ['students-list-class-names', tenant?.id, classIds],
    queryFn: async () => {
      if (!tenant || classIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('classes', tenant).in('id', classIds);
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
      const cn = classNameMap.get(e.class_id);
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
          const dob = info.getValue();
          if (!dob) return <span className="text-gray-400">—</span>;
          const age = calculateAge(dob);
          return age !== null ? `${age}` : dob;
        },
        size: 60,
      }),
      columnHelper.accessor('family_id', {
        id: 'guardian',
        header: t('pages.students.guardian_column'),
        cell: ({ row }) => {
          const fid = row.original.family_id;
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSlideOverPersonId(row.original.id)}
          >
            {t('pages.students.details_button')}
          </Button>
        ),
        size: 80,
      }),
    ],
    [t, enrolmentsByPerson, familyMap, contactPrefsMap]
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

  const handleClassFilter = (classId: string) => {
    setSelectedClassId((prev) => (prev === classId ? null : classId));
    setPage(1);
  };

  const handleStatusFilter = (s: StatusFilter) => {
    setStatusFilter(s);
    setPage(1);
  };

  const handleSort = (field: PersonSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const familyOptions = useMemo(
    () =>
      families.map((f) => ({
        value: f.id,
        label: f.name ?? f.contact_person_name ?? f.id,
      })),
    [families]
  );

  const levelOptions = useMemo(
    () => levels.map((l) => ({ value: l.id, label: l.name })),
    [levels]
  );

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{t('pages.students.title')}</h1>
        <p className="text-gray-600">{t('pages.students.description')}</p>
      </div>

      {/* Filter bar */}
      <div className="space-y-3">
        {/* Status tabs */}
        <div className="flex gap-2">
          {(['active', 'inactive', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
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

        {/* Class quick-filter buttons */}
        {classes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">{t('pages.students.filter_by_class')}</span>
            {classes.map((cls: { id: string; name: string }) => (
              <button
                key={cls.id}
                onClick={() => handleClassFilter(cls.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedClassId === cls.id
                    ? 'border-transparent text-white'
                    : 'border-gray-300 text-gray-700 hover:border-gray-500'
                }`}
                style={
                  selectedClassId === cls.id
                    ? { backgroundColor: 'var(--color-info)', borderColor: 'var(--color-info)' }
                    : {}
                }
              >
                {cls.name}
              </button>
            ))}
            {selectedClassId && (
              <button
                onClick={() => { setSelectedClassId(null); setPage(1); }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800 underline"
              >
                {t('pages.students.clear_class_filter')}
              </button>
            )}
          </div>
        )}

        {/* Family, level, age filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <FilterSelect
            id="family-filter"
            label={t('pages.students.filter_by_family')}
            value={selectedFamilyId ?? ''}
            onChange={(v) => {
              setSelectedFamilyId(v || null);
              setPage(1);
            }}
            options={familyOptions}
            allLabel={t('common.all')}
          />
          <FilterSelect
            id="level-filter"
            label={t('pages.students.filter_by_level')}
            value={selectedLevelId ?? ''}
            onChange={(v) => {
              setSelectedLevelId(v || null);
              setPage(1);
            }}
            options={levelOptions}
            allLabel={t('common.all')}
          />
          <AgeRangeFilter
            minAge={minAge}
            maxAge={maxAge}
            onMinChange={(v) => {
              setMinAge(v);
              setPage(1);
            }}
            onMaxChange={(v) => {
              setMaxAge(v);
              setPage(1);
            }}
            onClear={() => {
              setMinAge(null);
              setMaxAge(null);
              setPage(1);
            }}
          />
        </div>

        {/* Search + Enrol button */}
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <PersonSearch
              value={searchQuery}
              onChange={(q) => { setSearchQuery(q); setPage(1); }}
              isSearching={isLoading}
            />
          </div>
          <Button variant="primary" onClick={() => window.location.assign('/enrol')}>
            {t('pages.people.enrol_button')}
          </Button>
        </div>
      </div>

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
          actionLabel={t('pages.people.enrol_button')}
          onAction={() => window.location.assign('/enrol')}
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
    </div>
  );
}
