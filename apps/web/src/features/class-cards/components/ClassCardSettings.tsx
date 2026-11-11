import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import {
  defaultCoveredClasses,
  fetchClassCardSettings,
  fetchClassCardTypes,
  fetchStudioClasses,
  saveClassCardSettings,
  saveClassCardType,
  type ClassCardType,
  type ClassCardTypeInput,
  type StudioClass,
} from '../service';

const KEY = ['class-cards'];

/**
 * Settings → Class cards. The studio admin switches class cards on (off to start with),
 * sets the late-cancel cutoff and the one-time extension, and makes the cards it sells.
 */
export function ClassCardSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const tenantId = tenant?.id;

  const settings = useQuery({
    queryKey: [...KEY, 'settings', tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => fetchClassCardSettings(tenantId!),
  });

  const [cutoff, setCutoff] = useState('12');
  const [extension, setExtension] = useState('3');
  useEffect(() => {
    if (settings.data) {
      setCutoff(String(settings.data.cancel_cutoff_hours));
      setExtension(String(settings.data.extension_months));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (values: { enabled: boolean; cancel_cutoff_hours: number; extension_months: number }) =>
      saveClassCardSettings(tenantId!, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  if (!tenant || !settings.data) return null;
  const on = settings.data.enabled;
  const cutoffNum = Number(cutoff);
  const extensionNum = Number(extension);
  const rulesValid =
    Number.isInteger(cutoffNum) && cutoffNum >= 0 && cutoffNum <= 168 &&
    Number.isInteger(extensionNum) && extensionNum >= 1 && extensionNum <= 24;

  return (
    <div className="space-y-8">
      <section className="space-y-2" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('settings.class_cards.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.class_cards.intro')}</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={on}
            disabled={save.isPending}
            onChange={(e) =>
              save.mutate({
                enabled: e.target.checked,
                cancel_cutoff_hours: settings.data.cancel_cutoff_hours,
                extension_months: settings.data.extension_months,
              })
            }
          />
          <span>{t('settings.class_cards.switch')}</span>
        </label>
        {!on && <p className="text-xs text-muted-foreground">{t('settings.class_cards.off_hint')}</p>}
      </section>

      {on && (
        <>
          <section className="space-y-3" aria-labelledby={`${id}-rules`}>
            <h3 id={`${id}-rules`} className="text-base font-semibold text-foreground">
              {t('settings.class_cards.rules_title')}
            </h3>
            <div className="space-y-1">
              <label htmlFor={`${id}-cutoff`} className="text-sm font-medium">
                {t('settings.class_cards.cutoff_label')}
              </label>
              <Input
                id={`${id}-cutoff`}
                type="number"
                inputMode="numeric"
                min={0}
                max={168}
                className="max-w-32"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
                aria-describedby={`${id}-cutoff-hint`}
              />
              <p id={`${id}-cutoff-hint`} className="text-xs text-muted-foreground">
                {t('settings.class_cards.cutoff_hint')}
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-ext`} className="text-sm font-medium">
                {t('settings.class_cards.extension_label')}
              </label>
              <Input
                id={`${id}-ext`}
                type="number"
                inputMode="numeric"
                min={1}
                max={24}
                className="max-w-32"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                aria-describedby={`${id}-ext-hint`}
              />
              <p id={`${id}-ext-hint`} className="text-xs text-muted-foreground">
                {t('settings.class_cards.extension_hint')}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!rulesValid}
              isLoading={save.isPending}
              onClick={() =>
                save.mutate({ enabled: true, cancel_cutoff_hours: cutoffNum, extension_months: extensionNum })
              }
            >
              {t('settings.class_cards.save')}
            </Button>
          </section>

          <CardTypes tenantId={tenant.id} currency={tenant.currency ?? 'ILS'} />
        </>
      )}

      {save.isError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {t('settings.class_cards.error')}
        </p>
      )}
    </div>
  );
}

function CardTypes({ tenantId, currency }: { tenantId: string; currency: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';
  const [editing, setEditing] = useState<ClassCardType | 'new5' | 'new10' | null>(null);

  const types = useQuery({ queryKey: [...KEY, 'types', tenantId], queryFn: () => fetchClassCardTypes(tenantId) });
  const classes = useQuery({ queryKey: [...KEY, 'classes', tenantId], queryFn: () => fetchStudioClasses(tenantId) });

  if (!types.data || !classes.data) return null;

  const describe = (c: ClassCardType) =>
    [
      t('settings.class_cards.classes_count', { count: c.class_count }),
      formatCurrency(c.price_minor, c.currency, locale),
      c.valid_months == null
        ? t('settings.class_cards.never_expires')
        : t('settings.class_cards.valid_months', { count: c.valid_months }),
      c.shareable ? t('settings.class_cards.shared') : t('settings.class_cards.personal'),
      ...(c.is_active ? [] : [t('settings.class_cards.not_on_sale')]),
    ].join(' · ');

  return (
    <section className="space-y-3" aria-labelledby={`${id}-cards`}>
      <h3 id={`${id}-cards`} className="text-base font-semibold text-foreground">
        {t('settings.class_cards.cards_title')}
      </h3>
      {types.data.length === 0 && editing == null && (
        <p className="text-sm text-muted-foreground">{t('settings.class_cards.no_cards')}</p>
      )}
      <ul className="space-y-2">
        {types.data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{describe(c)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
              {t('settings.class_cards.edit')}
            </Button>
          </li>
        ))}
      </ul>

      {editing == null ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new10')}>
            {t('settings.class_cards.add', { count: 10 })}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new5')}>
            {t('settings.class_cards.add', { count: 5 })}
          </Button>
        </div>
      ) : (
        <CardTypeForm
          key={typeof editing === 'string' ? editing : editing.id}
          tenantId={tenantId}
          currency={currency}
          classes={classes.data}
          existing={typeof editing === 'string' ? null : editing}
          startCount={editing === 'new5' ? 5 : 10}
          onDone={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function CardTypeForm({
  tenantId,
  currency,
  classes,
  existing,
  startCount,
  onDone,
}: {
  tenantId: string;
  currency: string;
  classes: StudioClass[];
  existing: ClassCardType | null;
  startCount: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [count, setCount] = useState(String(existing?.class_count ?? startCount));
  const [name, setName] = useState(existing?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(existing));
  const [price, setPrice] = useState(existing ? String(existing.price_minor / 100) : '');
  const [neverExpires, setNeverExpires] = useState(existing ? existing.valid_months == null : false);
  const [months, setMonths] = useState(String(existing?.valid_months ?? 3));
  const [shareable, setShareable] = useState(existing?.shareable ?? false);
  const [onSale, setOnSale] = useState(existing?.is_active ?? true);
  const [covered, setCovered] = useState<string[]>(existing?.offering_ids ?? defaultCoveredClasses(classes));

  const countNum = Number(count);
  const shownName = nameTouched ? name : t('settings.class_cards.default_name', { count: countNum || startCount });
  const priceMinor = Math.round(Number(price) * 100);
  const monthsNum = Number(months);
  const valid =
    shownName.trim().length > 0 &&
    Number.isInteger(countNum) && countNum >= 1 && countNum <= 500 &&
    price.trim() !== '' && Number.isFinite(priceMinor) && priceMinor >= 0 &&
    (neverExpires || (Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= 60)) &&
    covered.length > 0;

  const save = useMutation({
    mutationFn: (input: ClassCardTypeInput) => saveClassCardType(tenantId, currency, input, existing?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
      onDone();
    },
  });

  const submit = () =>
    save.mutate({
      name: shownName.trim(),
      class_count: countNum,
      price_minor: priceMinor,
      valid_months: neverExpires ? null : monthsNum,
      shareable,
      is_active: onSale,
      offering_ids: covered,
    });

  return (
    <form
      className="space-y-3 rounded-md border p-3"
      aria-label={existing ? t('settings.class_cards.edit') : t('settings.class_cards.new_card')}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-count`} className="text-sm font-medium">
            {t('settings.class_cards.count_label')}
          </label>
          <Input id={`${id}-count`} type="number" inputMode="numeric" min={1} max={500} value={count}
            onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-price`} className="text-sm font-medium">
            {t('settings.class_cards.price_label', { currency })}
          </label>
          <Input id={`${id}-price`} type="number" inputMode="decimal" min={0} step="0.01" value={price}
            onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            {t('settings.class_cards.name_label')}
          </label>
          <Input id={`${id}-name`} value={shownName} maxLength={120}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-months`} className="text-sm font-medium">
            {t('settings.class_cards.months_label')}
          </label>
          <Input id={`${id}-months`} type="number" inputMode="numeric" min={1} max={60} value={months}
            disabled={neverExpires} onChange={(e) => setMonths(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} />
            <span>{t('settings.class_cards.never_expires')}</span>
          </label>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={shareable} onChange={(e) => setShareable(e.target.checked)} />
        <span>{t('settings.class_cards.shareable_label')}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={onSale} onChange={(e) => setOnSale(e.target.checked)} />
        <span>{t('settings.class_cards.on_sale_label')}</span>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('settings.class_cards.covers_label')}</legend>
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settings.class_cards.no_classes')}</p>
        ) : (
          classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={covered.includes(c.id)}
                onChange={(e) =>
                  setCovered((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                }
              />
              <span>{c.name}</span>
            </label>
          ))
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!valid} isLoading={save.isPending}>
          {t('settings.class_cards.save_card')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('settings.class_cards.cancel')}
        </Button>
      </div>
      {save.isError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {t('settings.class_cards.error')}
        </p>
      )}
    </form>
  );
}
