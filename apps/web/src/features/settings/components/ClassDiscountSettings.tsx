import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  DEFAULT_CLASS_DISCOUNTS,
  formToRow,
  rowToForm,
  type ClassDiscountField,
  type ClassDiscountForm,
  type ClassDiscountRow,
  type DiscountUnit,
} from '../lib/classDiscounts';

const QUERY_KEY = 'class-discount-settings';
const COLUMNS = Object.keys(DEFAULT_CLASS_DISCOUNTS).join(', ');

/**
 * Settings → Discounts: automatic class discounts (sibling, extra class, early bird).
 * All come switched off with suggested amounts filled in. The discount is worked out
 * when a child is enrolled and shown to the parent before paying.
 */
export function ClassDiscountSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const id = useId();
  const [form, setForm] = useState<ClassDiscountForm>(() => rowToForm(null));
  const [loaded, setLoaded] = useState(false);
  const [invalid, setInvalid] = useState<ClassDiscountField[]>([]);
  const [saved, setSaved] = useState(false);

  const settings = useQuery({
    queryKey: [QUERY_KEY, tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_discount_settings')
        .select(COLUMNS)
        .eq('tenant_id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClassDiscountRow | null) ?? null;
    },
  });

  useEffect(() => {
    if (settings.isSuccess && !loaded) {
      setForm(rowToForm(settings.data));
      setLoaded(true);
    }
  }, [settings.isSuccess, settings.data, loaded]);

  const save = useMutation({
    mutationFn: async (row: ClassDiscountRow) => {
      const { error } = await supabase
        .from('class_discount_settings')
        .upsert({ tenant_id: tenant!.id, ...row, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });

  if (!tenant) return null;
  if (!tenant.profile?.teachesClasses) {
    return <p className="text-sm text-muted-foreground">{t('settings.class_discounts.classes_only')}</p>;
  }

  const set = <K extends keyof ClassDiscountForm>(key: K, value: ClassDiscountForm[K]) => {
    setSaved(false);
    setInvalid([]);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const currency = tenant.currency || 'ILS';
  const isInvalid = (field: ClassDiscountField) => invalid.includes(field);

  const onSave = () => {
    const result = formToRow(form);
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    save.mutate(result.row);
  };

  const unitSelect = (key: 'sibling_unit' | 'extra_class_unit' | 'early_bird_unit', labelId: string) => (
    <select
      aria-labelledby={labelId}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      value={form[key]}
      onChange={(e) => set(key, e.target.value as DiscountUnit)}
    >
      <option value="percent">{t('settings.class_discounts.unit_percent')}</option>
      <option value="amount">{t('settings.class_discounts.unit_amount', { currency })}</option>
    </select>
  );

  const valueInput = (field: ClassDiscountField, label: string, kind: DiscountUnit | 'days') => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${field}`} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${id}-${field}`}
        type="number"
        min={kind === 'percent' ? 1 : 0}
        max={kind === 'percent' ? 90 : kind === 'days' ? 365 : undefined}
        step={kind === 'amount' ? '0.01' : 1}
        inputMode={kind === 'amount' ? 'decimal' : 'numeric'}
        value={form[field]}
        aria-invalid={isInvalid(field) || undefined}
        aria-describedby={isInvalid(field) ? `${id}-${field}-error` : undefined}
        onChange={(e) => set(field, e.target.value)}
      />
      {isInvalid(field) && (
        <p id={`${id}-${field}-error`} className="text-xs text-error">
          {t(`settings.class_discounts.invalid_${kind}`)}
        </p>
      )}
    </div>
  );

  const rule = (
    key: 'sibling' | 'extra_class' | 'early_bird',
    children: ReactNode,
  ) => {
    const enabledKey = `${key}_enabled` as const;
    const unitKey = `${key}_unit` as const;
    const unitLabelId = `${id}-${key}-unit`;
    return (
      <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-base font-semibold">{t(`settings.class_discounts.${key}_title`)}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form[enabledKey]}
            onChange={(e) => set(enabledKey, e.target.checked)}
          />
          <span>{t(`settings.class_discounts.${key}_switch`)}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t(`settings.class_discounts.${key}_hint`)}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span id={unitLabelId} className="block text-sm font-medium">
              {t('settings.class_discounts.unit_label')}
            </span>
            {unitSelect(unitKey, unitLabelId)}
          </div>
          {children}
        </div>
      </fieldset>
    );
  };

  return (
    <section className="space-y-5" aria-labelledby={`${id}-title`}>
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('settings.class_discounts.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.class_discounts.intro')}</p>
      </div>

      {rule(
        'sibling',
        <>
          {valueInput('sibling_value', t('settings.class_discounts.sibling_second'), form.sibling_unit)}
          {valueInput('sibling_more_value', t('settings.class_discounts.sibling_more'), form.sibling_unit)}
        </>,
      )}
      {rule('extra_class', valueInput('extra_class_value', t('settings.class_discounts.value'), form.extra_class_unit))}
      {rule(
        'early_bird',
        <>
          {valueInput('early_bird_value', t('settings.class_discounts.value'), form.early_bird_unit)}
          {valueInput('early_bird_days_before', t('settings.class_discounts.early_bird_days'), 'days')}
        </>,
      )}

      <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-base font-semibold">{t('settings.class_discounts.combine_title')}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={`${id}-combine`}
            className="mt-1"
            checked={form.combine_mode === 'add_up'}
            onChange={() => set('combine_mode', 'add_up')}
          />
          <span>{t('settings.class_discounts.combine_add_up')}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={`${id}-combine`}
            className="mt-1"
            checked={form.combine_mode === 'biggest'}
            onChange={() => set('combine_mode', 'biggest')}
          />
          <span>{t('settings.class_discounts.combine_biggest')}</span>
        </label>
        <div className="max-w-xs">
          {valueInput('max_total_percent', t('settings.class_discounts.max_total'), 'percent')}
        </div>
      </fieldset>

      <p className="text-xs text-muted-foreground">{t('settings.class_discounts.existing_unchanged')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" isLoading={save.isPending} disabled={settings.isLoading} onClick={onSave}>
          {t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {saved ? t('settings.class_discounts.saved') : invalid.length > 0 ? t('settings.class_discounts.fix_fields') : ''}
        </span>
      </div>
      {(save.error || settings.error) && (
        <p role="alert" className="text-sm text-error">
          {t('settings.class_discounts.error')}
        </p>
      )}
    </section>
  );
}
