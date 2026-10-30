import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { useJobs } from '../hooks/useJobs';
import { JOB_STATUSES, type JobStatus } from '../services/jobService';
import { JOB_STATUS_BADGE, jobStatusKey } from '../lib/jobStatus';
import { JobCreateForm } from './JobCreateForm';
import { JobGalleryRowLink } from './JobGalleryLink';
import type { JobRow } from '../services/jobService';

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${JOB_STATUS_BADGE[status]}`}>
      {t(jobStatusKey(status))}
    </span>
  );
}

/**
 * Admin jobs list ("Shoots" for photographers): every job_details row with its
 * client, package, date and pipeline status, plus an inline create form.
 */
export function JobsList() {
  const { t, i18n } = useTranslation();
  const { labels } = useEntityLabels();
  const { jobs, isLoading, error } = useJobs();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  const visible = useMemo(
    () => (statusFilter === 'all' ? jobs : jobs.filter((job) => job.job_status === statusFilter)),
    [jobs, statusFilter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{labels.engagement.plural}</h1>
        <Button variant="primary" onClick={() => setShowForm((open) => !open)}>
          {showForm ? t('common.cancel') : t('pages.jobs.new')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('pages.jobs.subtitle')}</p>

      {showForm && <JobCreateForm onCreated={() => setShowForm(false)} />}

      <div className="flex items-center gap-2">
        <label htmlFor="job-status-filter" className="text-sm font-medium">
          {t('pages.jobs.filter_status')}
        </label>
        <select
          id="job-status-filter"
          className="border rounded px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
        >
          <option value="all">{t('pages.jobs.filter_all')}</option>
          {JOB_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(jobStatusKey(status))}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error && (
        <div className="alert-error" role="alert">
          {error.message}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <EmptyState title={t('pages.jobs.empty_title')} message={t('pages.jobs.empty_message')} />
      )}

      {visible.length > 0 && (
        // Phones: one stacked card per shoot (no sideways scrolling).
        <ul className="space-y-3 sm:hidden" aria-label={labels.engagement.plural}>
          {visible.map((job) => (
            <JobCard key={job.engagement_id} job={job} />
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="card overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-start">{t('pages.jobs.client')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.package')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.when')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.location')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.status')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.contract')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.engagement_id}>
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/admin/jobs/${job.engagement_id}`} className="underline">
                      {job.client_name ?? '—'}
                    </Link>
                    {job.client_email && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {job.client_email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{job.package_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    {job.booked_starts_at
                      ? formatAppointmentWhen(job.booked_starts_at, i18n.language)
                      : t('pages.jobs.unscheduled')}
                  </td>
                  <td className="px-3 py-2">{job.location ?? '—'}</td>
                  <td className="px-3 py-2">
                    <JobStatusBadge status={job.job_status} />
                  </td>
                  <td className="px-3 py-2">
                    {job.waiver_evidence_id ? t('pages.jobs.contract_signed') : t('pages.jobs.contract_unsigned')}
                    <div>
                      <JobGalleryRowLink url={job.gallery_url} clientName={job.client_name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="card space-y-2 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/admin/jobs/${job.engagement_id}`} className="font-medium underline">
            {job.client_name ?? '—'}
          </Link>
          {job.client_email && (
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              {job.client_email}
            </div>
          )}
        </div>
        <JobStatusBadge status={job.job_status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t('pages.jobs.package')}</dt>
        <dd>{job.package_name ?? '—'}</dd>
        <dt className="text-muted-foreground">{t('pages.jobs.when')}</dt>
        <dd>
          {job.booked_starts_at
            ? formatAppointmentWhen(job.booked_starts_at, i18n.language)
            : t('pages.jobs.unscheduled')}
        </dd>
        <dt className="text-muted-foreground">{t('pages.jobs.location')}</dt>
        <dd className="break-words">{job.location ?? '—'}</dd>
        <dt className="text-muted-foreground">{t('pages.jobs.contract')}</dt>
        <dd>{job.waiver_evidence_id ? t('pages.jobs.contract_signed') : t('pages.jobs.contract_unsigned')}</dd>
      </dl>
      <JobGalleryRowLink url={job.gallery_url} clientName={job.client_name} />
    </li>
  );
}
