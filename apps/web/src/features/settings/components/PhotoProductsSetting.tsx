import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/hooks/useTenant';
import { usePhotoShopEnabled, useStudioPhotoProducts } from '@/features/jobs/hooks/usePhotoShop';
import { majorToMinor, minorToMajor, type StudioPhotoProduct } from '@/features/jobs/services/photoShopService';

interface Row {
  key: string;
  id?: string;
  name_en: string;
  name_he: string;
  size: string;
  price: string;
}

let rowSeq = 0;
const toRows = (list: StudioPhotoProduct[]): Row[] =>
  list.map((p) => ({
    key: `row-${++rowSeq}`,
    id: p.id,
    name_en: p.name_en,
    name_he: p.name_he,
    size: p.size_label ?? '',
    price: minorToMajor(p.price_minor),
  }));
const newKey = () => `row-${++rowSeq}`;

/**
 * Suggested when the studio has no products yet (owner, 22 Nov 2026): canvas and wood
 * prints in two sizes. Only the prices are left to fill in; rows without a price are not
 * saved.
 */
function suggestedRows(language: string): Row[] {
  const cm = language.startsWith('he') ? 'ס״מ' : 'cm';
  const make = (name_en: string, name_he: string, size: string): Row => ({
    key: newKey(),
    name_en,
    name_he,
    size: `${size} ${cm}`,
    price: '',
  });
  return [
    make('Canvas print', 'הדפסה על קנבס', '20x30'),
    make('Canvas print', 'הדפסה על קנבס', '30x45'),
    make('Wood print', 'הדפסה על עץ', '20x30'),
    make('Wood print', 'הדפסה על עץ', '30x45'),
  ];
}

/**
 * Photo shop > Prices: prints and other products the studio sells per photo, besides the
 * digital file. The client picks them under each photo. Only for studios with the photo
 * shop switched on.
 */
export function PhotoProductsSetting() {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <PhotoProductsForm />;
}

function PhotoProductsForm() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const { products, save } = useStudioPhotoProducts();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [saved, setSaved] = useState(false);
  const currency = tenant?.currency || 'ILS';

  useEffect(() => {
    if (products.data && !loaded) {
      if (products.data.length === 0) {
        setRows(suggestedRows(i18n.language));
        setSuggested(true);
      } else {
        setRows(toRows(products.data));
      }
      setLoaded(true);
    }
  }, [products.data, loaded, i18n.language]);

  const update = (key: string, patch: Partial<Row>) => {
    setSaved(false);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const remove = (key: string) => {
    setSaved(false);
    setRows((prev) => prev.filter((r) => r.key !== key));
  };
  const add = () => {
    setSaved(false);
    setRows((prev) => [...prev, { key: newKey(), name_en: '', name_he: '', size: '', price: '' }]);
  };

  // A row is saved once it has a name and a price. A name in one language fills the other.
  const ready = rows
    .map((r) => ({ r, price: majorToMinor(r.price) }))
    .filter(({ r, price }) => price != null && (r.name_en.trim() || r.name_he.trim()));

  const onSave = () =>
    save.mutate(
      ready.map(({ r, price }, i) => ({
        id: r.id,
        name_en: r.name_en.trim() || r.name_he.trim(),
        name_he: r.name_he.trim() || r.name_en.trim(),
        size_label: r.size.trim() || null,
        price_minor: price as number,
        position: i,
      })),
      {
        onSuccess: (fresh) => {
          setRows(toRows(fresh));
          setSaved(true);
          setSuggested(false);
        },
      },
    );

  if (products.isLoading) return null;

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.photo_shop.products.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.photo_shop.products.intro')}</p>
      {suggested && <p className="text-sm text-muted-foreground">{t('settings.photo_shop.products.suggested')}</p>}
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const rowId = `${id}-${r.key}`;
          return (
            <li key={r.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_8rem_7rem_auto] sm:items-end">
              <div className="space-y-1">
                <label htmlFor={`${rowId}-en`} className="block text-xs font-medium">
                  {t('settings.photo_shop.products.name_en')}
                </label>
                <Input id={`${rowId}-en`} dir="ltr" value={r.name_en} maxLength={120}
                  onChange={(e) => update(r.key, { name_en: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${rowId}-he`} className="block text-xs font-medium">
                  {t('settings.photo_shop.products.name_he')}
                </label>
                <Input id={`${rowId}-he`} dir="rtl" value={r.name_he} maxLength={120}
                  onChange={(e) => update(r.key, { name_he: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${rowId}-size`} className="block text-xs font-medium">
                  {t('settings.photo_shop.products.size')}
                </label>
                <Input id={`${rowId}-size`} value={r.size} maxLength={60}
                  onChange={(e) => update(r.key, { size: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${rowId}-price`} className="block text-xs font-medium">
                  {t('settings.photo_shop.products.price', { currency })}
                </label>
                <Input id={`${rowId}-price`} type="number" min={0} step="0.01" inputMode="decimal" value={r.price}
                  onChange={(e) => update(r.key, { price: e.target.value })} />
              </div>
              <Button size="sm" variant="outline"
                aria-label={t('settings.photo_shop.products.remove_row', { number: i + 1 })}
                onClick={() => remove(r.key)}>
                {t('settings.photo_shop.products.remove')}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={add}>{t('settings.photo_shop.products.add')}</Button>
        <Button size="sm" variant="primary" isLoading={save.isPending} onClick={onSave}>
          {t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {saved ? t('settings.photo_shop.saved') : ''}
        </span>
      </div>
      {rows.length > ready.length && (
        <p className="text-xs text-muted-foreground">{t('settings.photo_shop.products.needs_price')}</p>
      )}
      {save.error && <p role="alert" className="text-sm text-error">{(save.error as Error).message}</p>}
    </section>
  );
}
