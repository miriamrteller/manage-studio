import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import type { StudentEnrolmentSummary } from '@/features/enrolment/lib/enrolmentFilterOptions';
import { EnrolmentSummaryList } from '@/features/enrolment/components/EnrolmentSummaryList';
import { resolveGuardianEmail } from '@/features/enrolment/lib/resolveGuardianEmail';
import { ClientShootList } from '@/features/jobs/components/ClientShootList';
import type { JobRow } from '@/features/jobs/services/jobService';
import { getStudentAgeDisplay } from '@/lib/utils';
import type { Person } from '@shared/schemas';
import type {
  StudentsListContactPrefs,
  StudentsListFamily,
} from '../../hooks/useStudentsListLookups';

const columnHelper = createColumnHelper<Person>();

/** Column definitions for the Students (or photographer Clients) table. */
export function useStudentsListColumns({
  isPhotographer,
  enrolmentsByPerson,
  familyMap,
  contactPrefsMap,
  jobsByPerson,
  openEnrolModal,
  openNewShoot,
  openDetails,
}: {
  isPhotographer: boolean;
  enrolmentsByPerson: Map<string, StudentEnrolmentSummary[]>;
  familyMap: Map<string, StudentsListFamily>;
  contactPrefsMap: Map<string, StudentsListContactPrefs>;
  jobsByPerson: Map<string, JobRow[]>;
  openEnrolModal: (person: Person) => void;
  openNewShoot: (person?: Person) => void;
  openDetails: (personId: string) => void;
}) {
  const { t } = useTranslation();

  return useMemo(
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
        cell: ({ row }) => isPhotographer ? (
          <ClientShootList jobs={jobsByPerson.get(row.original.id) ?? []} compact />
        ) : (
          <EnrolmentSummaryList
            enrolments={enrolmentsByPerson.get(row.original.id) ?? []}
            returnTo="/admin/people"
            compact
            audience="admin"
            linkContext={{
              studentName: row.original.name,
              guardianEmail: resolveGuardianEmail({
                person: row.original,
                family: row.original.account_id
                  ? familyMap.get(row.original.account_id)
                  : undefined,
              }),
              guardianName: row.original.account_id
                ? familyMap.get(row.original.account_id)?.contact_person_name ?? null
                : null,
            }}
          />
        ),
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
          // Phones: stack the two pills instead of squeezing them.
          <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                isPhotographer ? openNewShoot(row.original) : openEnrolModal(row.original)
              }
            >
              {t('pages.students.enrol_button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openDetails(row.original.id)}
            >
              {t('pages.students.details_button')}
            </Button>
          </div>
        ),
        size: 160,
      }),
    ],
    [t, enrolmentsByPerson, familyMap, contactPrefsMap, openEnrolModal, isPhotographer, jobsByPerson, openNewShoot, openDetails]
  );
}
