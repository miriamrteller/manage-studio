import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useJobPhotoShopPhotos } from '../hooks/usePhotoShop';
import { PhotoShopService } from '../services/photoShopService';
import { makePreview, PREVIEW_ACCEPT, PreviewError, watermarkText } from '../lib/photoPreview';

type Progress = { phase: 'idle' } | { phase: 'working'; done: number; total: number } | { phase: 'done'; added: number; skipped: string[] };

/**
 * Shoot page → Photo shop → Photos. The photographer picks the shoot's photos;
 * her browser shrinks and watermarks each one before upload, so the originals
 * stay on her computer. The file name is kept so she can find the original.
 */
export function JobPhotoShopPhotos({ engagementId, tenantId }: { engagementId: string; tenantId: string }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const { photos, remove, refresh } = useJobPhotoShopPhotos(engagementId);
  const [progress, setProgress] = useState<Progress>({ phase: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const list = photos.data ?? [];
  const busy = progress.phase === 'working';

  const onFiles = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (picked.length === 0) return;
    setError(null);
    setProgress({ phase: 'working', done: 0, total: picked.length });
    const mark = watermarkText(tenant?.name);
    const skipped: string[] = [];
    let added = 0;
    try {
      // One at a time: keeps memory low on big shoots, and what's done is kept if one fails.
      for (const [i, file] of picked.entries()) {
        try {
          const blob = await makePreview(file, mark);
          added += await PhotoShopService.uploadPreviews(tenantId, engagementId, [{ blob, fileName: file.name }]);
        } catch (e) {
          if (e instanceof PreviewError) skipped.push(file.name);
          else throw e;
        }
        setProgress({ phase: 'working', done: i + 1, total: picked.length });
      }
      setProgress({ phase: 'done', added, skipped });
    } catch {
      setError(t('pages.jobs.photo_shop.photos.upload_failed'));
      setProgress({ phase: 'done', added, skipped });
    } finally {
      await refresh();
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{t('pages.jobs.photo_shop.photos.title')}</h3>
      <p id={hintId} className="text-sm text-muted-foreground">{t('pages.jobs.photo_shop.photos.hint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          accept={PREVIEW_ACCEPT}
          className="sr-only"
          aria-describedby={hintId}
          disabled={busy}
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button size="sm" variant="primary" isLoading={busy} onClick={() => input.current?.click()}>
          {t('pages.jobs.photo_shop.photos.add')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {progress.phase === 'working' &&
            t('pages.jobs.photo_shop.photos.working', { done: progress.done, total: progress.total })}
          {progress.phase === 'done' && t('pages.jobs.photo_shop.photos.added', { count: progress.added })}
          {list.length > 0 && progress.phase !== 'working' && (
            <> {t('pages.jobs.photo_shop.photos.count', { count: list.length })}</>
          )}
        </span>
      </div>
      {progress.phase === 'done' && progress.skipped.length > 0 && (
        <p role="status" className="text-sm text-gray-700">
          {t('pages.jobs.photo_shop.photos.skipped', { names: progress.skipped.join(', ') })}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {remove.error && (
        <p role="alert" className="text-sm text-error">
          {String((remove.error as Error).message).includes('already_bought')
            ? t('pages.jobs.photo_shop.photos.bought')
            : t('pages.jobs.photo_shop.photos.remove_failed')}
        </p>
      )}
      {list.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {list.map((p) => (
            <li key={p.id} className="space-y-1">
              {p.url ? (
                <img src={p.url} alt={p.file_name} loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
              ) : (
                <div className="aspect-[4/3] w-full rounded bg-muted" aria-hidden="true" />
              )}
              <div className="flex items-center justify-between gap-1 text-xs">
                <span className="truncate" dir="ltr">{p.file_name}</span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-muted-foreground underline hover:text-error"
                  aria-label={t('pages.jobs.photo_shop.photos.remove_label', { name: p.file_name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(p.id)}
                >
                  {t('pages.jobs.photo_shop.photos.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
