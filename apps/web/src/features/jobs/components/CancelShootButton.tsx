import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useJob } from '../hooks/useJobs';
import { useJobPaymentRequests } from '../hooks/useJobPaymentRequests';
import { formatMinor } from '../lib/jobPaymentFormat';
import type { JobRow } from '../services/jobService';

/**
 * "Cancel shoot" on the shoot page. One step: frees the time, stops open pay
 * links and reminders, and (ticked by default when we have an email) tells
 * the client. Paid money is shown but never refunded automatically.
 */
export function CancelShootButton({ job }: { job: JobRow }) {
  const { t, i18n } = useTranslation();
  const { cancelJob, isCancelling } = useJob(job.engagement_id);
  const { requests } = useJobPaymentRequests(job.engagement_id);
  const hasEmail = Boolean(job.client_email?.trim());
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState(hasEmail);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (message) return <p role="status" className="text-sm">{message}</p>;
  if (job.job_status === 'cancelled') return null;

  const paid = (requests ?? []).filter((r) => r.status === 'paid');
  const paidMinor = paid.reduce((sum, r) => sum + r.amount_minor, 0);
  const currency = paid[0]?.currency ?? job.currency ?? 'ILS';

  const confirm = async () => {
    setError(null);
    try {
      const result = await cancelJob(notify && hasEmail);
      const key = !(notify && hasEmail) ? 'done' : result.emailed ? 'done_emailed' : 'done_not_emailed';
      setMessage(t(`pages.jobs.cancel.${key}`));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.jobs.error_generic'));
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {t('pages.jobs.cancel.button')}
      </Button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title={t('pages.jobs.cancel.title')} size="sm">
          <div className="space-y-3">
            <p className="text-sm">{t('pages.jobs.cancel.intro')}</p>
            {paidMinor > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('pages.jobs.cancel.paid', { amount: formatMinor(paidMinor, currency, i18n.language) })}
              </p>
            )}
            {hasEmail ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                {t('pages.jobs.cancel.notify', { name: job.client_name?.trim() || job.client_email })}
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">{t('pages.jobs.cancel.no_email')}</p>
            )}
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" isLoading={isCancelling} onClick={confirm}>
                {t('pages.jobs.cancel.confirm')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {t('pages.jobs.cancel.keep')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
