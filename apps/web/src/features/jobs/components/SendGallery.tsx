import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTenant } from '@/hooks/useTenant';
import {
  useGalleryEmailSignature,
  useGalleryEmailStandardBody,
  useSendShootGallery,
  useUploadGalleryEmailPhoto,
} from '../hooks/useSendShootGallery';
import { PREVIEW_ACCEPT } from '../lib/photoPreview';
import type { GalleryEmailExtras, SendGalleryOutcome, SendGalleryResult } from '../services/shootGalleryService';

/** Same as GALLERY_MESSAGE_MAX in supabase/functions/_shared/photo-shop/send-gallery.ts. */
const GALLERY_MESSAGE_MAX = 2000;
/** Same as GALLERY_PHOTO_ALT_MAX there. */
const GALLERY_PHOTO_ALT_MAX = 200;
/** Same as GALLERY_SIGNATURE_MAX there. */
const GALLERY_SIGNATURE_MAX = 100;

/**
 * "Edit email text" (owner, 22 Nov 2026): the studio can change the gallery email's main
 * paragraph before sending. The box starts with the standard text; the greeting, the
 * gallery and photo shop buttons and the closing line stay outside it, so no link is lost.
 * Closed, or unchanged: the standard text goes.
 * "Add a photo" (owner, 22 Nov 2026): one photo under that paragraph, the same for every
 * client in the send. Uploaded once and linked (a hosted image, not an attachment). Its
 * description starts filled in, in the email's language.
 */
function useGalleryMessage() {
  const { i18n } = useTranslation();
  const tenant = useTenant();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoAlt, setPhotoAlt] = useState('');
  const upload = useUploadGalleryEmailPhoto();
  const standard = useGalleryEmailStandardBody(open);
  const [signature, setSignature] = useState<string | null>(null);
  const savedSignature = useGalleryEmailSignature(open);
  useEffect(() => {
    if (open && signature === null && savedSignature.name !== null) setSignature(savedSignature.name);
  }, [open, signature, savedSignature.name]);
  useEffect(() => {
    if (open && text === null && standard.body) setText(standard.body);
  }, [open, text, standard.body]);
  const message = open && text !== null && text.trim() && text.trim() !== standard.body?.trim()
    ? text
    : undefined;
  const extras: GalleryEmailExtras = open
    ? { message, ...(photoUrl ? { photoUrl, photoAlt } : {}), ...(signature?.trim() ? { signature } : {}) }
    : {};
  const removePhoto = () => {
    setPhotoUrl(null);
    setPhotoAlt('');
    upload.reset();
  };
  return {
    open,
    text: text ?? '',
    language: standard.language,
    ready: text !== null,
    extras,
    setText,
    signature: signature ?? '',
    setSignature,
    photoUrl,
    photoAlt,
    setPhotoAlt,
    uploading: upload.isPending,
    uploadFailed: upload.isError,
    addPhoto: (file: File) => {
      upload.mutate(file, {
        onSuccess: (url) => {
          setPhotoUrl(url);
          const inEmailLanguage = i18n.getFixedT(standard.language);
          setPhotoAlt(inEmailLanguage('pages.jobs.send_gallery.photo_alt_default', { studio: tenant?.name ?? '' }));
        },
      });
    },
    removePhoto,
    toggle: () => {
      if (open) {
        setText(null);
        setSignature(null);
        removePhoto();
      }
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
          <label htmlFor={`${id}-signature`} className="block pt-1 text-xs font-medium">
            {t('pages.jobs.send_gallery.signature_label')}
          </label>
          <Input
            id={`${id}-signature`}
            dir={editor.language === 'he' ? 'rtl' : 'ltr'}
            lang={editor.language}
            maxLength={GALLERY_SIGNATURE_MAX}
            value={editor.signature}
            onChange={(event) => editor.setSignature(event.target.value)}
            aria-describedby={`${id}-signature-hint`}
            className="min-w-[16rem]"
          />
          <p id={`${id}-signature-hint`} className="text-xs text-muted-foreground">
            {t('pages.jobs.send_gallery.signature_hint')}
          </p>
          <GalleryPhotoPicker editor={editor} />
        </div>
      )}
    </div>
  );
}

function GalleryPhotoPicker({ editor }: { editor: ReturnType<typeof useGalleryMessage> }) {
  const { t } = useTranslation();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  if (editor.photoUrl) {
    return (
      <div className="space-y-1 pt-1">
        <img src={editor.photoUrl} alt="" className="h-24 w-auto rounded border border-border object-cover" />
        <label htmlFor={`${id}-alt`} className="block text-xs font-medium">
          {t('pages.jobs.send_gallery.photo_alt_label')}
        </label>
        <Input
          id={`${id}-alt`}
          dir={editor.language === 'he' ? 'rtl' : 'ltr'}
          lang={editor.language}
          maxLength={GALLERY_PHOTO_ALT_MAX}
          value={editor.photoAlt}
          onChange={(event) => editor.setPhotoAlt(event.target.value)}
          className="min-w-[16rem]"
        />
        <p className="text-xs text-muted-foreground">{t('pages.jobs.send_gallery.photo_same_for_all')}</p>
        <Button size="sm" variant="ghost" onClick={editor.removePhoto}>
          {t('pages.jobs.send_gallery.photo_remove')}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1 pt-1">
      <input
        ref={fileInput}
        type="file"
        accept={PREVIEW_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="gallery-email-photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) editor.addPhoto(file);
        }}
      />
      <Button size="sm" variant="outline" isLoading={editor.uploading} onClick={() => fileInput.current?.click()}>
        {t('pages.jobs.send_gallery.photo_add')}
      </Button>
      {editor.uploadFailed && (
        <p role="alert" className="text-xs text-error">{t('pages.jobs.send_gallery.photo_failed')}</p>
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
        disabled={editor.uploading}
        onClick={() => send.mutate({ engagementIds: [engagementId], ...editor.extras })}
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
          disabled={engagementIds.length === 0 || editor.uploading}
          isLoading={send.isPending}
          onClick={() => send.mutate({ engagementIds, ...editor.extras })}
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
