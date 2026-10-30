import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useJobGallery, useJobPaymentRequests } from '../hooks/useJobPaymentRequests';
import { formatDueDate, formatMinor } from '../lib/jobPaymentFormat';
import { JobPaymentService } from '../services/jobPaymentService';
import { safeGalleryUrl } from '../lib/galleryUrl';

interface Props {
  engagementId: string;
  currency: string;
  /**
   * 'full' (default): outstanding requests with pay buttons + the gallery link.
   * 'gallery': only the gallery state — for ClientPortal, which lists
   * payments in its own section.
   */
  mode?: 'full' | 'gallery';
}

/**
 * Client-facing: outstanding requests with pay buttons, and the gallery link —
 * which the server (get_client_job_gallery) only returns once everything is
 * paid or the studio released it. Nothing here can reveal the URL early.
 */
export function ClientJobGalleryCard({ engagementId, currency, mode = 'full' }: Props) {
  if (mode === 'gallery') return <GalleryOnly engagementId={engagementId} />;
  return <FullCard engagementId={engagementId} currency={currency} />;
}

function GalleryLink({ gallery }: { gallery: ReturnType<typeof useJobGallery>['gallery'] }) {
  const { t } = useTranslation();
  const href = gallery?.released ? safeGalleryUrl(gallery.gallery_url) : null;
  if (href) {
    return (
      <a className="inline-block text-sm font-medium underline text-primary" href={href} target="_blank" rel="noopener noreferrer">
        {t('pages.jobs.client_portal.openGallery')}
      </a>
    );
  }
  if (gallery?.has_gallery) {
    return <p className="text-sm text-muted-foreground">{t('pages.jobs.client_portal.galleryLocked')}</p>;
  }
  return null;
}

function GalleryOnly({ engagementId }: { engagementId: string }) {
  const { t } = useTranslation();
  const { gallery, isLoading } = useJobGallery(engagementId);
  if (isLoading) return null;
  if (!gallery?.has_gallery) {
    return <p className="text-sm text-muted-foreground">{t('pages.client_portal.gallery_not_ready')}</p>;
  }
  return <GalleryLink gallery={gallery} />;
}

function FullCard({ engagementId, currency }: { engagementId: string; currency: string }) {
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
      <h3 id={`job-pay-${engagementId}`} className="font-medium">{t('pages.jobs.client_portal.title')}</h3>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pages.jobs.client_portal.nothingDue')}</p>
      ) : (
        <ul className="space-y-2">
          {open.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <bdi>{r.label}</bdi> · <bdi dir="ltr">{formatMinor(r.amount_minor, currency, language)}</bdi>
                {r.due_date && <span className="text-muted-foreground"> · {t('pages.jobs.payments.dueOn', { date: formatDueDate(r.due_date, language) })}</span>}
              </span>
              <Button size="sm" variant="primary" onClick={() => window.location.assign(JobPaymentService.payUrlFor(r.public_token))}>
                {t('pages.jobs.client_portal.pay')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <GalleryLink gallery={gallery} />
    </section>
  );
}
