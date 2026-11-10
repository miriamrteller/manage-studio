import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  SmugMugActionError,
  SmugMugService,
  type GalleryCheckItem,
} from '@/features/settings/services/smugmugService';
import { formatDueDate } from '../lib/jobPaymentFormat';
import type { JobPhotoShop } from '../services/photoShopService';
import { JobPhotoShopPhotos } from './JobPhotoShopPhotos';

type Source = 'smugmug' | 'upload';

const CHECK_ORDER: GalleryCheckItem['code'][] = [
  'watermark',
  'largest_size',
  'downloads',
  'photos',
  'preview_public',
  'original_hidden',
];

/**
 * Shoot page → Photo shop → where the photos come from. A studio with SmugMug connected
 * picks the shoot's gallery (prefilled with the one named like the shoot) and "Check
 * gallery" reads its Photo Protection settings and photos. Otherwise, or if the studio
 * prefers, it uploads watermarked copies here (JobPhotoShopPhotos).
 */
export function JobPhotoShopSource({ engagementId, shop }: { engagementId: string; shop: JobPhotoShop }) {
  const { t } = useTranslation();
  const status = useQuery({ queryKey: ['smugmug-status'], queryFn: () => SmugMugService.getStatus() });
  const connected = status.data?.connected === true;
  const [source, setSource] = useState<Source | null>(null);
  const groupName = useId();

  // Prefill: the shoot's saved choice, else SmugMug when it's connected.
  const chosen: Source = source ?? (shop.provider === 'upload' || !connected ? 'upload' : 'smugmug');

  if (status.isLoading) return null;
  if (!connected) {
    return (
      <div className="space-y-2">
        <JobPhotoShopPhotos engagementId={engagementId} tenantId={shop.tenant_id} />
        <p className="text-xs text-muted-foreground">{t('pages.jobs.photo_shop.source.connect_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">{t('pages.jobs.photo_shop.source.title')}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['smugmug', 'upload'] as const).map((s) => (
            <label key={s} className="inline-flex items-center gap-2">
              <input type="radio" name={groupName} value={s} checked={chosen === s} onChange={() => setSource(s)} />
              {t(`pages.jobs.photo_shop.source.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {chosen === 'smugmug' ? (
        <SmugMugGallery engagementId={engagementId} shop={shop} />
      ) : (
        <JobPhotoShopPhotos engagementId={engagementId} tenantId={shop.tenant_id} />
      )}
    </div>
  );
}

function SmugMugGallery({ engagementId, shop }: { engagementId: string; shop: JobPhotoShop }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const selectId = useId();
  const albums = useQuery({
    queryKey: ['smugmug-albums', engagementId],
    queryFn: () => SmugMugService.listAlbums(engagementId),
    retry: false,
  });
  const current = shop.provider === 'smugmug' ? shop.gallery_key : null;
  const [albumKey, setAlbumKey] = useState<string>(current ?? '');

  // Prefill the picker with the gallery named like the shoot.
  useEffect(() => {
    if (!albumKey && albums.data?.suggested) setAlbumKey(albums.data.suggested);
  }, [albums.data?.suggested, albumKey]);

  const check = useMutation({
    mutationFn: (key: string) => SmugMugService.checkGallery(engagementId, key),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['photo-shop', engagementId] }),
  });

  const saved = shop.smugmug_check && shop.smugmug_check.album_key === current ? shop.smugmug_check : null;
  const items = check.data?.items ?? (albumKey === current ? saved?.items : undefined);
  const passed = check.data?.passed ?? (albumKey === current ? saved?.passed : undefined);
  const errorCode = check.error instanceof SmugMugActionError ? check.error.code : check.error ? 'failed' : null;
  const listError = albums.error instanceof SmugMugActionError ? albums.error.code : albums.error ? 'failed' : null;

  return (
    <div className="space-y-3 text-sm">
      {albums.isLoading && <p className="text-muted-foreground">{t('pages.jobs.photo_shop.source.loading')}</p>}
      {listError && (
        <p role="alert" className="text-error">{t(`pages.jobs.photo_shop.source.error.${knownError(listError)}`)}</p>
      )}
      {albums.data && (
        <div className="space-y-1">
          <label htmlFor={selectId} className="block font-medium">{t('pages.jobs.photo_shop.source.gallery')}</label>
          <div className="flex flex-wrap gap-2">
            <Select id={selectId} className="min-w-0 flex-1" value={albumKey}
              onChange={(e) => { check.reset(); setAlbumKey(e.target.value); }}>
              <option value="">{t('pages.jobs.photo_shop.source.choose')}</option>
              {albums.data.albums.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.imageCount != null ? t('pages.jobs.photo_shop.source.album', { name: a.name, count: a.imageCount }) : a.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="primary" disabled={!albumKey} isLoading={check.isPending}
              onClick={() => check.mutate(albumKey)}>
              {albumKey === current && saved ? t('pages.jobs.photo_shop.source.check_again') : t('pages.jobs.photo_shop.source.check')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('pages.jobs.photo_shop.source.check_hint')}</p>
        </div>
      )}

      {errorCode && (
        <p role="alert" className="text-error">{t(`pages.jobs.photo_shop.source.error.${knownError(errorCode)}`)}</p>
      )}

      {items && items.length > 0 && (
        <div aria-live="polite" className="space-y-2">
          <ul className="space-y-1">
            {CHECK_ORDER.map((code) => {
              const item = items.find((i) => i.code === code);
              if (!item) return null;
              return (
                <li key={code} className="flex gap-2">
                  <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
                  <span className={item.ok ? '' : 'text-error'}>
                    {t(`pages.jobs.photo_shop.source.item.${code}.${item.ok ? 'ok' : 'fix'}`, {
                      value: item.value ?? '',
                      count: Number(item.value) || 0,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          {passed ? (
            <p>
              {t('pages.jobs.photo_shop.source.passed', {
                date: formatDueDate(shop.smugmug_checked_at ?? new Date().toISOString(), i18n.language),
              })}{' '}
              <span className="text-muted-foreground">{t('pages.jobs.photo_shop.source.live_check')}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">{t('pages.jobs.photo_shop.source.failed')}</p>
          )}
        </div>
      )}
    </div>
  );
}

const KNOWN_ERRORS = ['albums_unavailable', 'album_not_found', 'photos_unavailable', 'token_rejected', 'unreachable', 'not_connected'];

function knownError(code: string): string {
  return KNOWN_ERRORS.includes(code) ? code : 'failed';
}
