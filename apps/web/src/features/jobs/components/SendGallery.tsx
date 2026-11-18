import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useSendShootGallery } from '../hooks/useSendShootGallery';
import type { SendGalleryOutcome, SendGalleryResult } from '../services/shootGalleryService';

/**
 * "Send gallery" (owner, 18 Nov 2026): one press emails the client the gallery-ready
 * email with the gallery and, when there is a photo shop, a 3-day shop link.
 * Shoots that cannot go yet are skipped and counted, never blocked.
 */
export function SendGalleryButton({ engagementId, size = 'sm' }: { engagementId: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const send = useSendShootGallery();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size={size} variant="outline" isLoading={send.isPending} onClick={() => send.mutate([engagementId])}>
        {t('pages.jobs.send_gallery.button')}
      </Button>
      <SendGalleryOutcomeText result={send.data} error={send.error} single />
    </span>
  );
}

const SKIP_ORDER: SendGalleryOutcome[] = ['not_checked', 'no_gallery', 'no_email', 'cancelled', 'not_found', 'failed'];

export function SendGalleryOutcomeText({
  result,
  error,
  single = false,
}: {
  result: SendGalleryResult | undefined;
  error: unknown;
  single?: boolean;
}) {
  const { t } = useTranslation();
  if (error) return <p role="alert" className="text-sm text-error">{t('pages.jobs.send_gallery.error')}</p>;
  if (!result) return null;

  if (single) {
    const outcome = result.results[0]?.outcome;
    if (outcome === 'sent') {
      return <p role="status" className="text-sm text-success">{t('pages.jobs.send_gallery.sent_single')}</p>;
    }
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('pages.jobs.send_gallery.skipped', { count: 1 })} {t(`pages.jobs.send_gallery.reason.${outcome ?? 'failed'}`)}
      </p>
    );
  }

  const notSent = result.skipped + result.failed;
  const byReason = SKIP_ORDER.map((reason) => ({
    reason,
    count: result.results.filter((r) => r.outcome === reason).length,
  })).filter((r) => r.count > 0);
  return (
    <div role="status" className="space-y-1 text-sm">
      <p className={result.sent > 0 ? 'text-success' : 'text-muted-foreground'}>
        {t('pages.jobs.send_gallery.sent', { count: result.sent })}
      </p>
      {notSent > 0 && (
        <div className="text-muted-foreground">
          <p>{t('pages.jobs.send_gallery.skipped', { count: notSent })}</p>
          <ul className="list-disc ps-5">
            {byReason.map(({ reason, count }) => (
              <li key={reason}>
                {t(`pages.jobs.send_gallery.reason.${reason}`)} ({count})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Shown above the list once shoots are ticked. */
export function SendGalleryBulkBar({
  engagementIds,
  owingCount,
  onClear,
}: {
  engagementIds: string[];
  owingCount: number;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const send = useSendShootGallery();
  return (
    <div className="card space-y-2 p-3" aria-label={t('pages.jobs.send_gallery.select')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {t('pages.jobs.send_gallery.selected', { count: engagementIds.length })}
        </span>
        <Button
          size="sm"
          variant="primary"
          disabled={engagementIds.length === 0}
          isLoading={send.isPending}
          onClick={() => send.mutate(engagementIds)}
        >
          {t('pages.jobs.send_gallery.button_selected')}
        </Button>
        <Button size="sm" variant="ghost" disabled={send.isPending} onClick={() => { send.reset(); onClear(); }}>
          {t('pages.jobs.send_gallery.clear')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('pages.jobs.send_gallery.hint')}</p>
      {owingCount > 0 && (
        <p className="text-xs text-amber-800">{t('pages.jobs.send_gallery.owing', { count: owingCount })}</p>
      )}
      <SendGalleryOutcomeText result={send.data} error={send.error} />
    </div>
  );
}
