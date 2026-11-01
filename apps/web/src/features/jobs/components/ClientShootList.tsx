import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import type { JobRow } from '../services/jobService';
import { JobStatusBadge } from './JobsList';

interface ClientShootListProps {
  jobs: JobRow[];
  compact?: boolean;
}

/** One client's shoots, each linking to its shoot page (Clients page, photographer). */
export function ClientShootList({ jobs, compact = false }: ClientShootListProps) {
  const { t, i18n } = useTranslation();

  if (jobs.length === 0) {
    return compact ? (
      <span className="text-gray-400 text-xs">—</span>
    ) : (
      <p className="text-sm text-gray-400">{t('pages.students.no_enrolments')}</p>
    );
  }

  return (
    <ul className={compact ? 'flex flex-col gap-1' : 'space-y-2'}>
      {jobs.map((job) => (
        <li
          key={job.engagement_id}
          className={
            compact
              ? 'flex flex-wrap items-center gap-x-2 gap-y-1'
              : 'flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-white px-2 py-1.5'
          }
        >
          <span className={compact ? 'text-xs' : 'text-sm'}>
            <Link to={`/admin/jobs/${job.engagement_id}`} className="font-medium underline">
              {job.package_name ?? t('pages.jobs.title')}
            </Link>
            {!compact && (
              <span className="ms-2 text-gray-500">
                {job.booked_starts_at
                  ? formatAppointmentWhen(job.booked_starts_at, i18n.language)
                  : t('pages.jobs.unscheduled')}
              </span>
            )}
          </span>
          <JobStatusBadge status={job.job_status} />
        </li>
      ))}
    </ul>
  );
}
