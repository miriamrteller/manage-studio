import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { useJobs } from '../hooks/useJobs';
import { JOB_STATUSES, type JobStatus } from '../services/jobService';
import { JOB_STATUS_BADGE, jobStatusKey } from '../lib/jobStatus';
import { JobCreateForm, type JobCreatePrefill } from './JobCreateForm';
import { JobGalleryRowLink } from './JobGalleryLink';
import { SendGalleryBulkBar, SendGalleryButton } from './SendGallery';
import { hasGalleryToSend } from '../lib/galleryToSend';
import { useGalleryLastSent } from '../hooks/useSendShootGallery';
import { usePhotoShopEnabled, useShootGalleryNames } from '../hooks/usePhotoShop';
import { Checkbox } from '@/components/ui/checkbox';
import type { JobRow } from '../services/jobService';
import { latestQuoteByProject, openAmountMinor, useProjectRequests } from '../lib/projectSummary';
import { formatMinor } from '../lib/jobPaymentFormat';
import type { JobPaymentRequest } from '../services/jobPaymentService';
import { useQuoteList } from '@/features/quotes/hooks/useQuotes';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';
import type { QuoteSummary } from '@/features/quotes/services/quoteService';

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
  // "Add client" / "New shoot" on the Clients page land here with the form
  // open (and the client preselected) via router state.
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = (location.state as { newShoot?: JobCreatePrefill } | null)?.newShoot ?? null;
  const [showForm, setShowForm] = useState(prefill !== null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  const visible = useMemo(
    () => (statusFilter === 'all' ? jobs : jobs.filter((job) => job.job_status === statusFilter)),
    [jobs, statusFilter],
  );
  // In the row (owner, 13 Nov 2026: fewer clicks): the quote and what is still to pay.
  const { data: requests = [] } = useProjectRequests(visible.map((job) => job.engagement_id));
  const { data: quotes = [] } = useQuoteList();
  const quoteByProject = latestQuoteByProject(quotes);
  // Tick several shoots, then one action for all (owner, 18 Nov 2026: send every gallery).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectable = visible.filter((job) => job.job_status !== 'cancelled');
  const selectedIds = selectable.filter((job) => selected.has(job.engagement_id)).map((job) => job.engagement_id);
  const allSelected = selectable.length > 0 && selectedIds.length === selectable.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) =>
    setSelected(on ? new Set(selectable.map((job) => job.engagement_id)) : new Set());
  const lastSent = useGalleryLastSent(selectable.map((job) => job.engagement_id));
  // The SmugMug gallery picked for each shoot (owner, 19 Nov 2026). Column only with the photo shop on.
  const shopOn = usePhotoShopEnabled();
  const galleryNames = useShootGalleryNames();
  const summaryOf = (job: JobRow): ProjectRowSummary => ({
    galleryName: galleryNames.get(job.engagement_id) ?? null,
    lastSentAt: lastSent.get(job.engagement_id) ?? null,
    quote: quoteByProject.get(job.engagement_id),
    openMinor: openAmountMinor(requests.filter((r: JobPaymentRequest) => r.engagement_id === job.engagement_id)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{labels.engagement.plural}</h1>
        <div className="flex flex-wrap gap-2">
          {/* Past shoots come in with the client sheet (owner, 17 Nov 2026). */}
          <Button variant="outline" onClick={() => navigate('/admin/people/import')}>
            {t('clients_import.button_shoots')}
          </Button>
          <Button variant="primary" onClick={() => setShowForm((open) => !open)}>
            {showForm ? t('common.cancel') : t('pages.jobs.new')}
          </Button>
        </div>
      </div>

      {showForm && <JobCreateForm prefill={prefill} onCreated={() => setShowForm(false)} />}

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

      {selectedIds.length > 0 && (
        <SendGalleryBulkBar
          engagementIds={selectedIds}
          owingCount={selectable.filter((job) => selected.has(job.engagement_id) && summaryOf(job).openMinor > 0).length}
          onClear={() => setSelected(new Set())}
        />
      )}

      {visible.length > 0 && (
        // Phones: one stacked card per shoot (no sideways scrolling).
        <ul className="space-y-3 sm:hidden" aria-label={labels.engagement.plural}>
          {visible.map((job) => (
            <JobCard
              key={job.engagement_id}
              job={job}
              summary={summaryOf(job)}
              selected={selected.has(job.engagement_id)}
              onSelect={(on) => toggle(job.engagement_id, on)}
            />
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="card overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-8 px-3 py-2 text-start">
                  <Checkbox
                    aria-label={t('pages.jobs.send_gallery.select_all')}
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.client')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.package')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.when')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.status')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.gallery')}</th>
                <th className="px-3 py-2 text-start">{t('pages.jobs.contract')}</th>
                <th className="px-3 py-2 text-start">{t('pages.people.project_quote')}</th>
                <th className="px-3 py-2 text-start">{t('pages.people.still_to_pay')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.engagement_id}>
                  <td className="px-3 py-2">
                    {job.job_status !== 'cancelled' && (
                      <Checkbox
                        aria-label={t('pages.jobs.send_gallery.select_row', { name: job.client_name ?? '—' })}
                        checked={selected.has(job.engagement_id)}
                        onCheckedChange={(on) => toggle(job.engagement_id, on)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/admin/projects/${job.engagement_id}`} className="underline">
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
                    {job.location && (
                      <div className="text-xs text-muted-foreground" dir="auto">
                        {job.location}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <JobStatusBadge status={job.job_status} />
                  </td>
                  <td className="px-3 py-2">
                    <GalleryCell job={job} summary={summaryOf(job)} shopOn={shopOn} />
                  </td>
                  <td className="px-3 py-2">
                    {job.waiver_evidence_id ? t('pages.jobs.contract_signed') : t('pages.jobs.contract_unsigned')}
                  </td>
                  <td className="px-3 py-2">
                    <QuoteCell quote={summaryOf(job).quote} />
                  </td>
                  <td className="px-3 py-2">
                    <ToPayCell openMinor={summaryOf(job).openMinor} currency={job.currency} />
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

interface ProjectRowSummary {
  /** Name of the SmugMug gallery picked for the shoot; null = none. */
  galleryName: string | null;
  lastSentAt: string | null;
  quote: QuoteSummary | undefined;
  openMinor: number;
}

function GalleryCell({ job, summary, shopOn }: { job: JobRow; summary: ProjectRowSummary; shopOn: boolean }) {
  const canSend = hasGalleryToSend(job, summary.galleryName);
  if (!canSend && !job.gallery_url && !summary.galleryName) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-1">
      {shopOn && summary.galleryName && <GalleryNameCell name={summary.galleryName} />}
      <div>
        <JobGalleryRowLink url={job.gallery_url} clientName={job.client_name} />
      </div>
      {canSend && <SendGalleryButton engagementId={job.engagement_id} lastSentAt={summary.lastSentAt} />}
    </div>
  );
}

function GalleryNameCell({ name }: { name: string | null }) {
  return name ? (
    <span className="break-words" dir="auto">
      {name}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function QuoteCell({ quote }: { quote: QuoteSummary | undefined }) {
  return quote ? <QuoteStatusBadge status={quote.status} /> : <span className="text-muted-foreground">—</span>;
}

function ToPayCell({ openMinor, currency }: { openMinor: number; currency: string | null }) {
  const { t, i18n } = useTranslation();
  return openMinor > 0 ? (
    <span className="font-medium text-amber-800">{formatMinor(openMinor, currency ?? 'ILS', i18n.language)}</span>
  ) : (
    <span className="text-muted-foreground">{t('pages.people.nothing_to_pay')}</span>
  );
}

function JobCard({
  job,
  summary,
  selected,
  onSelect,
}: {
  job: JobRow;
  summary: ProjectRowSummary;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const cancelled = job.job_status === 'cancelled';
  return (
    <li className="card space-y-2 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        {!cancelled && (
          <Checkbox
            className="mt-1"
            aria-label={t('pages.jobs.send_gallery.select_row', { name: job.client_name ?? '—' })}
            checked={selected}
            onCheckedChange={onSelect}
          />
        )}
        <div className="min-w-0 flex-1">
          <Link to={`/admin/projects/${job.engagement_id}`} className="font-medium underline">
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
        {summary.galleryName && (
          <>
            <dt className="text-muted-foreground">{t('pages.jobs.smugmug_gallery')}</dt>
            <dd>
              <GalleryNameCell name={summary.galleryName} />
            </dd>
          </>
        )}
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
        <dt className="text-muted-foreground">{t('pages.people.project_quote')}</dt>
        <dd>
          <QuoteCell quote={summary.quote} />
        </dd>
        <dt className="text-muted-foreground">{t('pages.people.still_to_pay')}</dt>
        <dd>
          <ToPayCell openMinor={summary.openMinor} currency={job.currency} />
        </dd>
      </dl>
      <JobGalleryRowLink url={job.gallery_url} clientName={job.client_name} />
      {hasGalleryToSend(job, summary.galleryName) && (
        <SendGalleryButton engagementId={job.engagement_id} lastSentAt={summary.lastSentAt} />
      )}
    </li>
  );
}
