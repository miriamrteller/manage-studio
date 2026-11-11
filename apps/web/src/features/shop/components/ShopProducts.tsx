import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTenant } from '@/hooks/useTenant';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { makePreview, PREVIEW_ACCEPT, PreviewError } from '@/features/jobs/lib/photoPreview';
import { majorToMinor, minorToMajor } from '@/features/jobs/services/photoShopService';
import { useStudioShopProducts } from '../hooks/useStudioShop';
import {
  SHOP_IMAGE_MAX_EDGE,
  StudioShopService,
  type ShopProduct,
  type ShopVariant,
} from '../services/studioShopService';

interface SizeDraft {
  id?: string;
  label: string;
  stock: string;
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  price: string;
  imagePath: string | null;
  active: boolean;
  sizes: SizeDraft[];
}

const emptyDraft = (oneSize: string): Draft => ({
  name: '',
  description: '',
  price: '',
  imagePath: null,
  active: true,
  sizes: [{ label: oneSize, stock: '' }],
});

function draftFrom(p: ShopProduct): Draft {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    price: minorToMajor(p.price_minor),
    imagePath: p.image_path,
    active: p.active,
    sizes: p.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock == null ? '' : String(v.stock) })),
  };
}

function stockValue(value: string): number | null {
  if (!value.trim()) return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Shop → Items: what the studio sells (uniforms, shoes, accessories), each with a picture
 * of the item, a price and its sizes. Stock per size is optional: empty = not counted.
 */
export function ShopProducts() {
  const { t, i18n } = useTranslation();
  const { products, save, remove } = useStudioShopProducts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const list = products.data ?? [];

  if (products.isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (products.error) {
    return <p role="alert" className="text-sm text-error">{t('studio_shop.errors.failed')}</p>;
  }

  return (
    <div className="space-y-4">
      {draft ? (
        <ProductForm
          draft={draft}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onCancel={() => { save.reset(); setDraft(null); }}
          onSave={(d, oldImage) =>
            save.mutate(
              {
                id: d.id,
                name: d.name,
                description: d.description || null,
                price_minor: majorToMinor(d.price) ?? 0,
                image_path: d.imagePath,
                active: d.active,
                variants: d.sizes.filter((s) => s.label.trim()).map<ShopVariant>((s) => ({
                  id: s.id,
                  label: s.label,
                  stock: stockValue(s.stock),
                })),
              },
              {
                onSuccess: () => {
                  if (oldImage && oldImage !== d.imagePath) void StudioShopService.removeImage(oldImage);
                  setDraft(null);
                },
              },
            )
          }
        />
      ) : (
        <Button variant="primary" onClick={() => setDraft(emptyDraft(t('studio_shop.items.one_size')))}>
          {t('studio_shop.items.add')}
        </Button>
      )}

      {list.length === 0 && !draft ? (
        <p className="text-sm text-muted-foreground">{t('studio_shop.items.none')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.id} className="card flex gap-3 p-3 text-sm">
              {p.image_path ? (
                <img src={StudioShopService.imageUrl(p.image_path)} alt={p.name}
                  className="h-20 w-20 shrink-0 rounded object-cover" />
              ) : (
                <div aria-hidden="true" className="h-20 w-20 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {!p.active && <Badge variant="secondary">{t('studio_shop.items.hidden')}</Badge>}
                </div>
                <p>{formatMinor(p.price_minor, p.currency, i18n.language)}</p>
                <p className="text-muted-foreground">
                  {p.variants.map((v) => sizeSummary(t, v)).join(' · ')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" aria-label={t('studio_shop.items.edit_label', { name: p.name })}
                    onClick={() => setDraft(draftFrom(p))}>
                    {t('studio_shop.items.edit')}
                  </Button>
                  <Button size="sm" variant="ghost" isLoading={remove.isPending && remove.variables === p.id}
                    aria-label={t('studio_shop.items.delete_label', { name: p.name })}
                    onClick={() => { if (window.confirm(t('studio_shop.items.delete_confirm', { name: p.name }))) remove.mutate(p.id); }}>
                    {t('studio_shop.items.delete')}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {remove.error && <p role="alert" className="text-sm text-error">{t('studio_shop.errors.failed')}</p>}
    </div>
  );
}

function sizeSummary(t: (k: string, o?: Record<string, unknown>) => string, v: ShopVariant): string {
  if (v.stock == null) return v.label;
  if (v.stock === 0) return t('studio_shop.items.size_sold_out', { size: v.label });
  return t('studio_shop.items.size_stock', { size: v.label, count: v.stock });
}

function ProductForm({
  draft: initial,
  saving,
  error,
  onCancel,
  onSave,
}: {
  draft: Draft;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (draft: Draft, oldImage: string | null) => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<Draft>(initial);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const patch = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const setSize = (i: number, p: Partial<SizeDraft>) =>
    setD((cur) => ({ ...cur, sizes: cur.sizes.map((s, n) => (n === i ? { ...s, ...p } : s)) }));
  const price = majorToMinor(d.price);
  const canSave = d.name.trim().length > 0 && price != null && !uploading;

  const onPicture = async (files: FileList | null) => {
    const file = files?.[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file || !tenant?.id) return;
    setImageError(null);
    setUploading(true);
    try {
      const blob = await makePreview(file, null, SHOP_IMAGE_MAX_EDGE);
      const path = await StudioShopService.uploadImage(tenant.id, blob);
      // A picture uploaded in this form but replaced again is never used: remove it.
      if (d.imagePath && d.imagePath !== initial.imagePath) void StudioShopService.removeImage(d.imagePath);
      patch({ imagePath: path });
    } catch (e) {
      setImageError(e instanceof PreviewError ? t('studio_shop.items.picture_unreadable') : t('studio_shop.errors.failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="card space-y-4 p-4"
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(d, initial.imagePath); }}
    >
      <h2 id={`${id}-title`} className="font-semibold">
        {d.id ? t('studio_shop.items.edit_title') : t('studio_shop.items.add_title')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium">{t('studio_shop.items.name')}</label>
          <Input id={`${id}-name`} value={d.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-price`} className="block text-sm font-medium">
            {t('studio_shop.items.price', { currency: tenant?.currency ?? 'ILS' })}
          </label>
          <Input id={`${id}-price`} type="number" min={0} step="0.01" inputMode="decimal"
            value={d.price} onChange={(e) => patch({ price: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-desc`} className="block text-sm font-medium">{t('studio_shop.items.description')}</label>
        <Textarea id={`${id}-desc`} rows={2} maxLength={1000} value={d.description}
          onChange={(e) => patch({ description: e.target.value })} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('studio_shop.items.picture')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {d.imagePath && (
            <img src={StudioShopService.imageUrl(d.imagePath)} alt={d.name || t('studio_shop.items.picture')}
              className="h-20 w-20 rounded object-cover" />
          )}
          <input ref={fileInput} id={`${id}-file`} type="file" accept={PREVIEW_ACCEPT} className="sr-only"
            aria-describedby={`${id}-file-hint`} onChange={(e) => void onPicture(e.target.files)} />
          <Button type="button" size="sm" variant="secondary" isLoading={uploading}
            onClick={() => fileInput.current?.click()}>
            {d.imagePath ? t('studio_shop.items.picture_change') : t('studio_shop.items.picture_add')}
          </Button>
          {d.imagePath && (
            <Button type="button" size="sm" variant="ghost" onClick={() => patch({ imagePath: null })}>
              {t('studio_shop.items.picture_remove')}
            </Button>
          )}
        </div>
        <p id={`${id}-file-hint`} className="text-xs text-muted-foreground">{t('studio_shop.items.picture_hint')}</p>
        {imageError && <p role="alert" className="text-sm text-error">{imageError}</p>}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('studio_shop.items.sizes')}</legend>
        <p className="text-xs text-muted-foreground">{t('studio_shop.items.sizes_hint')}</p>
        <ul className="space-y-2">
          {d.sizes.map((s, i) => (
            <li key={s.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor={`${id}-size-${i}`} className="block text-xs">{t('studio_shop.items.size')}</label>
                <Input id={`${id}-size-${i}`} className="w-40" maxLength={60} value={s.label}
                  onChange={(e) => setSize(i, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${id}-stock-${i}`} className="block text-xs">{t('studio_shop.items.stock')}</label>
                <Input id={`${id}-stock-${i}`} className="w-28" type="number" min={0} inputMode="numeric"
                  placeholder={t('studio_shop.items.stock_any')} value={s.stock}
                  onChange={(e) => setSize(i, { stock: e.target.value })} />
              </div>
              {d.sizes.length > 1 && (
                <Button type="button" size="sm" variant="ghost"
                  aria-label={t('studio_shop.items.size_remove_label', { size: s.label || i + 1 })}
                  onClick={() => setD((cur) => ({ ...cur, sizes: cur.sizes.filter((_, n) => n !== i) }))}>
                  {t('studio_shop.items.size_remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button type="button" size="sm" variant="ghost"
          onClick={() => setD((cur) => ({ ...cur, sizes: [...cur.sizes, { label: '', stock: '' }] }))}>
          {t('studio_shop.items.size_add')}
        </Button>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.active} onChange={(e) => patch({ active: e.target.checked })} />
        {t('studio_shop.items.shown')}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={!canSave} isLoading={saving}>{t('common.save')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-error">{t(`studio_shop.errors.${knownError(error)}`)}</p>}
    </form>
  );
}

const KNOWN_ERRORS = ['name_required', 'price_required', 'duplicate_size', 'size_label_required', 'bad_stock'];
function knownError(code: string): string {
  return KNOWN_ERRORS.includes(code) ? code : 'failed';
}
