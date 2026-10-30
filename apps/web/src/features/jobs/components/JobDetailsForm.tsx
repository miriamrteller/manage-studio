import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useJob } from '../hooks/useJobs';
import { JOB_STATUSES, type JobRow, type JobStatus } from '../services/jobService';
import { fromDateTimeLocal, jobStatusKey, toDateTimeLocal } from '../lib/jobStatus';

/** Editable job fields: status, schedule, location, notes, gallery link. */
export function JobDetailsForm({ job }: { job: JobRow }) {
  const { t } = useTranslation();
  const { updateDetails, updateSchedule, isUpdatingDetails, isUpdatingSchedule } = useJob(job.engagement_id);

  const [status, setStatus] = useState<JobStatus>(job.job_status);
  const [location, setLocation] = useState(job.location ?? '');
  const [notes, setNotes] = useState(job.notes ?? '');
  const [galleryUrl, setGalleryUrl] = useState(job.gallery_url ?? '');
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(job.booked_starts_at));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(job.booked_ends_at));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = isUpdatingDetails || isUpdatingSchedule;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (status === 'cancelled' && job.job_status !== 'cancelled' && !window.confirm(t('pages.jobs.status_cancelled') + '?')) {
      return;
    }
    try {
      const nextStarts = fromDateTimeLocal(startsAt);
      let nextEnds = fromDateTimeLocal(endsAt);
      if (nextStarts && !nextEnds) {
        nextEnds = new Date(new Date(nextStarts).getTime() + 60 * 60 * 1000).toISOString();
      }
      if (nextStarts !== job.booked_starts_at || nextEnds !== job.booked_ends_at) {
        await updateSchedule({ booked_starts_at: nextStarts, booked_ends_at: nextStarts ? nextEnds : null });
      }
      await updateDetails({ job_status: status, location, notes, gallery_url: galleryUrl });
      setMessage(t('pages.jobs.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.jobs.error_generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-4" aria-labelledby="job-details-heading">
      <h2 id="job-details-heading" className="font-semibold">
        {t('pages.jobs.details')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="job-status" className="block text-sm font-medium mb-1">
            {t('pages.jobs.status')}
          </label>
          <select
            id="job-status"
            className="w-full border rounded px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus)}
          >
            {JOB_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(jobStatusKey(value))}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="job-edit-location" className="block text-sm font-medium mb-1">
            {t('pages.jobs.location')}
          </label>
          <input id="job-edit-location" className="w-full border rounded px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label htmlFor="job-edit-starts" className="block text-sm font-medium mb-1">
            {t('pages.jobs.starts_at')}
          </label>
          <input id="job-edit-starts" type="datetime-local" className="w-full border rounded px-3 py-2" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="job-edit-ends" className="block text-sm font-medium mb-1">
            {t('pages.jobs.ends_at')}
          </label>
          <input id="job-edit-ends" type="datetime-local" className="w-full border rounded px-3 py-2" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={!startsAt} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="job-gallery-url" className="block text-sm font-medium mb-1">
            {t('pages.jobs.gallery_url')}
          </label>
          <input id="job-gallery-url" type="url" dir="ltr" className="w-full border rounded px-3 py-2" value={galleryUrl} onChange={(e) => setGalleryUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="job-edit-notes" className="block text-sm font-medium mb-1">
            {t('pages.jobs.notes')}
          </label>
          <textarea id="job-edit-notes" rows={3} className="w-full border rounded px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div aria-live="polite">
        {message && <p className="text-sm text-success">{message}</p>}
        {error && (
          <div className="alert-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t('pages.jobs.saving') : t('pages.jobs.save')}
      </Button>
    </form>
  );
}
