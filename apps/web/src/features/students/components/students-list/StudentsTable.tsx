import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { flexRender, type Table } from '@tanstack/react-table';
import { SortableHeader } from '@/components/shared/table';
import type { StudentEnrolmentSummary } from '@/features/enrolment/lib/enrolmentFilterOptions';
import type { JobRow } from '@/features/jobs/services/jobService';
import type { Person } from '@shared/schemas';
import type { PersonSortField } from '../../lib/personSort';
import type {
  StudentsListContactPrefs,
  StudentsListFamily,
} from '../../hooks/useStudentsListLookups';
import { ExpandedStudentRow } from '../ExpandedStudentRow';

/** The Students table: sortable headers, rows, and the expanded detail row. */
export function StudentsTable({
  table,
  isPhotographer,
  sortField,
  sortOrder,
  onSort,
  enrolmentsByPerson,
  familyMap,
  contactPrefsMap,
  jobsByPerson,
  onEnrol,
}: {
  table: Table<Person>;
  isPhotographer: boolean;
  sortField: PersonSortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: PersonSortField) => void;
  enrolmentsByPerson: Map<string, StudentEnrolmentSummary[]>;
  familyMap: Map<string, StudentsListFamily>;
  contactPrefsMap: Map<string, StudentsListContactPrefs>;
  jobsByPerson: Map<string, JobRow[]>;
  onEnrol: (person: Person) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card overflow-x-auto max-sm:p-2">
      <table className="w-full text-sm">
        <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
          <tr>
            <th className="px-1 sm:px-3 py-3" style={{ width: 32 }} />
            <SortableHeader
              label={t('pages.people.name_label')}
              sortKey="name"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
              className="px-2 sm:px-3 py-3 text-start font-medium text-gray-700"
            />
            <th className="px-2 sm:px-3 py-3 text-start font-medium text-gray-700">
              {t('pages.students.classes_column')}
            </th>
            {!isPhotographer && (
              <>
                <SortableHeader
                  label={t('pages.people.age_label')}
                  sortKey="date_of_birth"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  className="px-2 sm:px-3 py-3 text-start font-medium text-gray-700"
                />
                <th className="px-2 sm:px-3 py-3 text-start font-medium text-gray-700">
                  {t('pages.students.guardian_column')}
                </th>
              </>
            )}
            <th className="hidden sm:table-cell px-2 sm:px-3 py-3 text-start font-medium text-gray-700" style={{ width: 120 }}>
              {t('pages.students.notifications_column')}
            </th>
            <th className="px-2 sm:px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr
                className="border-b hover:bg-gray-50 transition-colors"
                style={{ borderColor: 'var(--color-border-default)' }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`${cell.column.id === 'expander' ? 'px-1' : 'px-2'} sm:px-3 py-3${
                      cell.column.id === 'notifications' ? ' hidden sm:table-cell' : ''
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() && (
                <tr className="bg-gray-50">
                  <td colSpan={row.getVisibleCells().length} className="px-6 py-4">
                    <ExpandedStudentRow
                      person={row.original}
                      enrolments={enrolmentsByPerson.get(row.original.id) ?? []}
                      familyMap={familyMap}
                      contactPrefsMap={contactPrefsMap}
                      onEnrol={onEnrol}
                      shoots={isPhotographer ? jobsByPerson.get(row.original.id) ?? [] : undefined}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
