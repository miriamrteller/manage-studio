import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { JobStatusBadge } from '@/features/jobs/components/JobsList';
import { latestQuoteByProject, openAmountMinor, useProjectRequests } from '@/features/jobs/lib/projectSummary';
import type { JobRow } from '@/features/jobs/services/jobService';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { useQuoteList } from '@/features/quotes/hooks/useQuotes';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';

/**
 * A client's projects on their page, everything in the row (owner, 13 Nov 2026: see shoots,
 * quotes, galleries and payments without switching tabs): date, status, quote, contract,
 * gallery and what is still to pay. Each links to the project page for the actions.
 */
export function PersonProjects({ jobs }: { jobs: JobRow[] }) {
  const { t, i18n } = useTranslation();
  const ids = jobs.map((job) => job.engagement_id);
  const { data: requests = [] } = useProjectRequests(ids);
  const { data: quotes = [] } = useQuoteList();
  const quoteByProject = latestQuoteByProject(quotes);

  if (jobs.length === 0) {
    return <p className="text-sm text-gray-400">{t('pages.people.no_projects')}</p>;
  }

  return (
    <ul className="space-y-2">
      {jobs.map((job) => {
        const quote = quoteByProject.get(job.engagement_id);
        const open = openAmountMinor(requests.filter((r) => r.engagement_id === job.engagement_id));
        const currency = job.currency ?? 'ILS';
        return (
          <li key={job.engagement_id} className="rounded border border-gray-100 bg-white px-2 py-1.5 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <Link to={`/admin/projects/${job.engagement_id}`} className="font-medium underline">
                  {job.package_name ?? t('pages.people.projects_section')}
                </Link>
                <span className="ms-2 text-gray-500">
                  {job.booked_starts_at
                    ? formatAppointmentWhen(job.booked_starts_at, i18n.language)
                    : t('pages.jobs.unscheduled')}
                </span>
              </span>
              <JobStatusBadge status={job.job_status} />
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <dt>{t('pages.people.project_quote')}:</dt>
                <dd>{quote ? <QuoteStatusBadge status={quote.status} /> : '—'}</dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>{t('pages.jobs.contract')}:</dt>
                <dd>{job.waiver_evidence_id ? t('pages.jobs.contract_signed') : t('pages.jobs.contract_unsigned')}</dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>{t('pages.jobs.gallery')}:</dt>
                <dd>
                  {!job.gallery_url
                    ? '—'
                    : job.gallery_released_at
                      ? t('pages.jobs.gallery_visible_to_client')
                      : t('pages.jobs.gallery_hidden_from_client')}
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>{t('pages.people.still_to_pay')}:</dt>
                <dd className={open > 0 ? 'font-medium text-amber-800' : undefined}>
                  {open > 0 ? formatMinor(open, currency, i18n.language) : t('pages.people.nothing_to_pay')}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
