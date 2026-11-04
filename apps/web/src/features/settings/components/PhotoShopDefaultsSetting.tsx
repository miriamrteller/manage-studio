import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/hooks/useTenant';
import { usePhotoShopEnabled, useStudioPhotoShopDefaults } from '@/features/jobs/hooks/usePhotoShop';
import { DEFAULT_GALLERY_OPEN_DAYS, majorToMinor, minorToMajor } from '@/features/jobs/services/photoShopService';

/**
 * Settings → Payment: photo shop defaults, copied into each new shoot's shop
 * (and editable there). Only for studios with the photo shop switched on.
 */
export function PhotoShopDefaultsSetting() {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <PhotoShopDefaultsForm />;
}

function PhotoShopDefaultsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const { defaults, save } = useStudioPhotoShopDefaults();
  const [perPhoto, setPerPhoto] = useState('');
  const [allPhotos, setAllPhotos] = useState('');
  const [days, setDays] = useState(String(DEFAULT_GALLERY_OPEN_DAYS));
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (defaults.data && !loaded) {
      setPerPhoto(minorToMajor(defaults.data.price_per_photo_minor));
      setAllPhotos(minorToMajor(defaults.data.all_photos_price_minor));
      setDays(String(defaults.data.gallery_open_days));
      setLoaded(true);
    }
  }, [defaults.data, loaded]);

  const currency = tenant?.currency || 'ILS';
  const daysNumber = Math.min(3650, Math.max(1, Math.floor(Number(days) || DEFAULT_GALLERY_OPEN_DAYS)));
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setSaved(false); setter(v); };

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.photo_shop.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.photo_shop.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-per`} className="block text-sm font-medium">
            {t('settings.photo_shop.per_photo', { currency })}
          </label>
          <Input id={`${id}-per`} type="number" min={0} step="0.01" inputMode="decimal" value={perPhoto}
            onChange={(e) => touch(setPerPhoto)(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-all`} className="block text-sm font-medium">
            {t('settings.photo_shop.all_photos', { currency })}
          </label>
          <Input id={`${id}-all`} type="number" min={0} step="0.01" inputMode="decimal" value={allPhotos}
            aria-describedby={`${id}-all-hint`} onChange={(e) => touch(setAllPhotos)(e.target.value)} />
          <p id={`${id}-all-hint`} className="text-xs text-muted-foreground">{t('settings.photo_shop.all_photos_hint')}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-days`} className="block text-sm font-medium">
            {t('settings.photo_shop.open_days')}
          </label>
          <Input id={`${id}-days`} type="number" min={1} max={3650} inputMode="numeric" value={days}
            onChange={(e) => touch(setDays)(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          isLoading={save.isPending}
          disabled={defaults.isLoading}
          onClick={() =>
            save.mutate(
              {
                price_per_photo_minor: majorToMinor(perPhoto),
                all_photos_price_minor: majorToMinor(allPhotos),
                gallery_open_days: daysNumber,
              },
              { onSuccess: () => setSaved(true) },
            )
          }
        >
          {t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {saved ? t('settings.photo_shop.saved') : ''}
        </span>
      </div>
      {save.error && <p role="alert" className="text-sm text-error">{(save.error as Error).message}</p>}
    </section>
  );
}
