import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useGalleryEmailStandardBody, useSendShootGallery } from '../hooks/useSendShootGallery';
import type { SendGalleryOutcome, SendGalleryResult } from '../services/shootGalleryService';

/** Same as GALLERY_MESSAGE_MAX in supabase/functions/_shared/photo-shop/send-gallery.ts. */
const GALLERY_MESSAGE_MAX = 2000;

/**
 * "Edit email text" (owner, 22 Nov 2026): the studio can change the gallery email's main
 * paragraph before sending. The box starts with the standard text; the greeting, the
 * gallery and photo shop buttons and the closing line stay outside it, so no link is lost.
 * Closed, or unchanged: the standard text goes.
 */
function useGalleryMessage() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const standard = useGalleryEmailStandardBody(open);
  useEffect(() => {
    if (open && text === null && standard.body) setText(standard.body);
  }, [open, text, standard.body]);
  const message = open && text !== null && text.trim() && text.trim() !== standard.body?.trim()
    ? text
    : undefined;
  return {
    open,
    text: text ?? '',
    language: standard.language,
    ready: text !== null,
    message,
    setText,
    toggle: () => {
      if (open) setText(null);
      setOpen(!open);
    },
  };
}

function GalleryMessageEditor({ editor }: { editor: ReturnType<typeof useGalleryMessage> }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="w-full space-y-1">
      <button
        type="button"
        className="text-xs text-primary underline underline-offset-2"
        aria-expanded={editor.open}
        aria-controls={`${id}-box`}
        onClick={editor.toggle}
      >
        {editor.open ? t('pages.jobs.send_gallery.message_standard') : t('pages.jobs.send_gallery.message_edit')}
      </button>
      {editor.open && (
        <div id={`${id}-box`} className="space-y-1">
          <label htmlFor={`${id}-text`} className="block text-xs font-medium">
            {t('pages.jobs.send_gallery.message_label')}
          </label>
          <Textarea
            id={`${id}-text`}
            rows={4}
            dir={editor.language === 'he' ? 'rtl' : 'ltr'}
            lang={editor.language}
            maxLength={GALLERY_MESSAGE_MAX}
            disabled={!editor.ready}
            value={editor.text}
            onChange={(event) => editor.setText(event.target.value)}
            aria-describedby={`${id}-hint`}
            className="min-w-[16rem]"
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t('pages.jobs.send_gallery.message_hint')}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * "Send gallery" (owner, 18 Nov 2026): one press emails the client the gallery-ready
 * email with the gallery and, when there is a photo shop, a 3-day shop link.
 * Shoots that cannot go yet are skipped and counted, never blocked.
 */
export function SendGalleryButton({
  engagementId,
  lastSentAt,
  size = 'sm',
}: {
  engagementId: string;
  /** When the gallery email last went: shown first, so a press is a knowing resend. */
  lastSentAt?: string | null;
  size?: 'sm' | 'md';
}) {
  const { t, i18n } = useTranslation();
  const send = useSendShootGallery({ resend: true });
  const editor = useGalleryMessage();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size={size}
        variant="outline"
        isLoading={send.isPending}
        onClick={() => send.mutate({ engagementIds: [engagementId], message: editor.message })}
      >
        {lastSentAt ? t('pages.jobs.send_gallery.button_again') : t('pages.jobs.send_gallery.button')}
      </Button>
      {lastSentAt && !send.data && (
        <span className="text-xs text-muted-foreground">
          {t('pages.jobs.send_gallery.last_sent', { when: formatSentAt(lastSentAt, i18n.language) })}
        </span>
      )}
      <GalleryMessageEditor editor={editor} />
      <SendGalleryOutcomeText result={send.data} error={send.error} single />
    </span>
  );
}

function formatSentAt(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

const SKIP_ORDER: SendGalleryOutcome[] = ['already_sent', 'not_checked', 'no_gallery', 'no_email', 'cancelled', 'not_found', 'failed'];

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
  const editor = useGalleryMessage();
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
          onClick={() => send.mutate({ engagementIds, message: editor.message })}
        >
          {t('pages.jobs.send_gallery.button_selected')}
        </Button>
        <Button size="sm" variant="ghost" disabled={send.isPending} onClick={() => { send.reset(); onClear(); }}>
          {t('pages.jobs.send_gallery.clear')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('pages.jobs.send_gallery.hint')}</p>
      <GalleryMessageEditor editor={editor} />
      {owingCount > 0 && (
        <p className="text-xs text-amber-800">{t('pages.jobs.send_gallery.owing', { count: owingCount })}</p>
      )}
      <SendGalleryOutcomeText result={send.data} error={send.error} />
    </div>
  );
}
