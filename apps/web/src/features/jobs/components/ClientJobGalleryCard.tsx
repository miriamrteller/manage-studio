import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useJobGallery, useJobPaymentRequests } from '../hooks/useJobPaymentRequests';
import { formatDueDate, formatMinor } from '../lib/jobPaymentFormat';
import { JobPaymentService } from '../services/jobPaymentService';

interface Props {
  engagementId: string;
  currency: string;
}

/**
 * Client-facing: outstanding requests with pay buttons, and the gallery link —
 * which the server (get_client_job_gallery) only returns once everything is
 * paid or the studio released it. Nothing here can reveal the URL early.
 */
export function ClientJobGalleryCard({ engagementId, currency }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { gallery, isLoading: galleryLoading } = useJobGallery(engagementId);
  const { requests, isLoading } = useJobPaymentRequests(engagementId);
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'sent');

  if (isLoading || galleryLoading) return null;
  // Not a photographer job (no requests, no gallery): render nothing.
  if (requests.length === 0 && !gallery?.has_gallery) return null;

  return (
    <section className="space-y-3 rounded-md border p-3" aria-labelledby={`job-pay-${engagementId}`}>
      <h3 id={`job-pay-${engagementId}`} className="font-medium">{t('pages.jobs.client.title')}</h3>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pages.jobs.client.nothingDue')}</p>
      ) : (
        <ul className="space-y-2">
          {open.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <bdi>{r.label}</bdi> · <bdi dir="ltr">{formatMinor(r.amount_minor, currency, language)}</bdi>
                {r.due_date && <span className="text-muted-foreground"> · {t('pages.jobs.payments.dueOn', { date: formatDueDate(r.due_date, language) })}</span>}
              </span>
              <Button size="sm" variant="primary" onClick={() => window.location.assign(JobPaymentService.payUrlFor(r.public_token))}>
                {t('pages.jobs.client.pay')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {gallery?.released && gallery.gallery_url ? (
        <a className="inline-block text-sm font-medium underline text-primary" href={gallery.gallery_url} target="_blank" rel="noreferrer">
          {t('pages.jobs.client.openGallery')}
        </a>
      ) : gallery?.has_gallery ? (
        <p className="text-sm text-muted-foreground">{t('pages.jobs.client.galleryLocked')}</p>
      ) : null}
    </section>
  );
}
