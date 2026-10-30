import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJobGallery } from '../hooks/useJobPaymentRequests';
import { formatMinor } from '../lib/jobPaymentFormat';

interface Props {
  engagementId: string;
  currency: string;
  language: string;
}

/**
 * Admin view of the gallery gate: released automatically once every
 * non-cancelled request is paid, or by "release anyway". The URL itself is
 * pasted on the job page (job_details.gallery_url, Thread A).
 */
export function JobGalleryGate({ engagementId, currency, language }: Props) {
  const { t } = useTranslation();
  const { gallery, isLoading, error, release } = useJobGallery(engagementId);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (error || !gallery) return <p role="alert" className="text-sm text-error">{error?.message ?? t('errors.generic')}</p>;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {t('pages.jobs.payments.gallery.title')}{' '}
          <Badge variant={gallery.released ? 'success' : 'secondary'}>
            {gallery.released ? t('pages.jobs.payments.gallery.released') : t('pages.jobs.payments.gallery.locked')}
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">
          {!gallery.has_gallery
            ? t('pages.jobs.payments.gallery.noUrl')
            : gallery.released_by_admin
              ? t('pages.jobs.payments.gallery.releasedByAdmin')
              : gallery.all_paid
                ? t('pages.jobs.payments.gallery.allPaid')
                : t('pages.jobs.payments.gallery.outstanding', {
                    amount: formatMinor(gallery.outstanding_minor, currency, language),
                  })}
        </p>
      </div>
      {gallery.released_by_admin ? (
        <Button size="sm" variant="outline" isLoading={release.isPending} onClick={() => release.mutate(false)}>
          {t('pages.jobs.payments.gallery.unrelease')}
        </Button>
      ) : (
        !gallery.all_paid && (
          <Button size="sm" variant="outline" isLoading={release.isPending} onClick={() => release.mutate(true)}>
            {t('pages.jobs.payments.gallery.releaseAnyway')}
          </Button>
        )
      )}
      {release.error && <p role="alert" className="w-full text-sm text-error">{(release.error as Error).message}</p>}
    </div>
  );
}
