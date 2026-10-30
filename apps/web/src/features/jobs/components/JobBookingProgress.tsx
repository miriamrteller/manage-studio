import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QuoteService } from '@/features/quotes/services/quoteService';
import { useJobPaymentRequests } from '../hooks/useJobPaymentRequests';
import { buildBookingProgress } from '../lib/bookingProgress';
import type { JobRow } from '../services/jobService';

function formatStepDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jerusalem',
    });
  } catch {
    return iso;
  }
}

/**
 * Quote accepted → Contract signed → Deposit paid, ticked off as the client
 * goes through the booking flow on their own. Only for shoots booked from a
 * quote (no accepted quote → nothing to show).
 */
export function JobBookingProgress({ job }: { job: JobRow }) {
  const { t, i18n } = useTranslation();
  const { data: acceptedQuote } = useQuery({
    queryKey: ['job-accepted-quote', job.engagement_id],
    queryFn: () => QuoteService.acceptedForEngagement(job.engagement_id),
  });
  const { requests } = useJobPaymentRequests(job.engagement_id);
  if (!acceptedQuote) return null;

  const steps = buildBookingProgress({
    acceptedQuote,
    contractSigned: Boolean(job.waiver_evidence_id),
    contractSignedAt: job.contract_signed_at,
    requests,
  });

  return (
    <section className="card p-4 space-y-3" aria-labelledby="job-progress-heading">
      <h2 id="job-progress-heading" className="font-semibold">
        {t('pages.jobs.progress.title')}
      </h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const status = step.notApplicable
            ? t('pages.jobs.progress.no_deposit')
            : step.done
              ? step.at
                ? t('pages.jobs.progress.done_on', { date: formatStepDate(step.at, i18n.language) })
                : t('pages.jobs.progress.done')
              : t('pages.jobs.progress.waiting');
          return (
            <li
              key={step.key}
              data-step={step.key}
              data-done={step.done ? 'true' : 'false'}
              className={`rounded border p-3 text-sm ${step.done ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
            >
              <span aria-hidden="true" className="me-2">{step.done ? '✓' : '○'}</span>
              <span className="font-medium">{t(`pages.jobs.progress.${step.key}`)}</span>
              <span className="block text-muted-foreground">{status}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
