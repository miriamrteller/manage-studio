import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  clientDiscountToRow,
  couponToRow,
  DEFAULT_CLIENT_DISCOUNT_INPUT,
  DEFAULT_COUPON_INPUT,
  type ClientDiscountInput,
  type CouponAppliesTo,
  type CouponInput,
  type DiscountUnit,
} from '../lib/classDiscounts';

interface ClientDiscountListRow {
  id: string;
  email: string;
  unit: DiscountUnit;
  value: number;
  note: string | null;
}

interface CouponListRow {
  id: string;
  code: string;
  unit: DiscountUnit;
  value: number;
  applies_to: CouponAppliesTo;
  valid_until: string | null;
  max_uses: number | null;
  active: boolean;
  note: string | null;
}

const UNIQUE_VIOLATION = '23505';

function useAmountText() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const currency = tenant?.currency || 'ILS';
  return (unit: DiscountUnit, value: number) =>
    unit === 'percent'
      ? t('settings.class_discounts.percent_off', { value })
      : t('settings.class_discounts.amount_off', { amount: formatCurrency(value, currency, i18n.language) });
}

function UnitSelect({
  value,
  onChange,
  labelledBy,
}: {
  value: DiscountUnit;
  onChange: (unit: DiscountUnit) => void;
  labelledBy: string;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  return (
    <select
      aria-labelledby={labelledBy}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as DiscountUnit)}
    >
      <option value="percent">{t('settings.class_discounts.unit_percent')}</option>
      <option value="amount">{t('settings.class_discounts.unit_amount', { currency: tenant?.currency || 'ILS' })}</option>
    </select>
  );
}

/** Discounts for particular clients, matched on the child's or a parent's email at enrolment. */
export function ClientDiscountsSection() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const id = useId();
  const amountText = useAmountText();
  const [form, setForm] = useState<ClientDiscountInput>(DEFAULT_CLIENT_DISCOUNT_INPUT);
  const [invalid, setInvalid] = useState<Array<'email' | 'value'>>([]);
  const [duplicate, setDuplicate] = useState(false);
  const key = ['class-discount-clients', tenant?.id];

  const list = useQuery({
    queryKey: key,
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_discount_clients')
        .select('id, email, unit, value, note')
        .eq('tenant_id', tenant!.id)
        .order('email');
      if (error) throw error;
      return (data ?? []) as ClientDiscountListRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (row: ReturnType<typeof clientDiscountToRow> & { ok: true }) => {
      const { error } = await supabase.from('class_discount_clients').insert({ tenant_id: tenant!.id, ...row.row });
      if (error) throw error;
    },
    onSuccess: async () => {
      setForm(DEFAULT_CLIENT_DISCOUNT_INPUT);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: { code?: string }) => setDuplicate(error?.code === UNIQUE_VIOLATION),
  });

  const remove = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from('class_discount_clients').delete().eq('id', rowId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (!tenant) return null;

  const set = <K extends keyof ClientDiscountInput>(k: K, v: ClientDiscountInput[K]) => {
    setInvalid([]);
    setDuplicate(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = clientDiscountToRow(form);
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    add.mutate(result);
  };

  const rows = list.data ?? [];
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t('settings.class_discounts.clients_title')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('settings.class_discounts.clients_hint')}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.class_discounts.clients_empty')}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span dir="ltr">{row.email}</span> · {amountText(row.unit, row.value)}
                {row.note && <span className="text-muted-foreground"> · {row.note}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(row.id)}>
                {t('settings.class_discounts.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={onAdd}>
        <div className="space-y-1">
          <label htmlFor={`${id}-email`} className="block text-sm font-medium">
            {t('settings.class_discounts.clients_email')}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            dir="ltr"
            value={form.email}
            aria-invalid={invalid.includes('email') || duplicate || undefined}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <span id={`${id}-unit`} className="block text-sm font-medium">
            {t('settings.class_discounts.unit_label')}
          </span>
          <UnitSelect value={form.unit} onChange={(u) => set('unit', u)} labelledBy={`${id}-unit`} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-value`} className="block text-sm font-medium">
            {t('settings.class_discounts.value')}
          </label>
          <Input
            id={`${id}-value`}
            type="number"
            className="w-24"
            inputMode={form.unit === 'amount' ? 'decimal' : 'numeric'}
            value={form.value}
            aria-invalid={invalid.includes('value') || undefined}
            onChange={(e) => set('value', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-note`} className="block text-sm font-medium">
            {t('settings.class_discounts.note')}
          </label>
          <Input id={`${id}-note`} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="outline" isLoading={add.isPending}>
          {t('settings.class_discounts.clients_add')}
        </Button>
      </form>
      <p aria-live="polite" className="text-xs text-error">
        {invalid.includes('email')
          ? t('settings.class_discounts.invalid_email')
          : invalid.includes('value')
            ? t(`settings.class_discounts.invalid_${form.unit}`)
            : duplicate
              ? t('settings.class_discounts.duplicate_email')
              : add.error || remove.error || list.error
                ? t('settings.class_discounts.error')
                : ''}
      </p>
    </section>
  );
}

/** Coupon codes parents type at checkout; prefilled as 10% off every payment. */
export function CouponsSection() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const id = useId();
  const amountText = useAmountText();
  const [form, setForm] = useState<CouponInput>(DEFAULT_COUPON_INPUT);
  const [invalid, setInvalid] = useState<Array<'code' | 'value' | 'max_uses'>>([]);
  const [duplicate, setDuplicate] = useState(false);
  const key = ['class-discount-coupons', tenant?.id];

  const list = useQuery({
    queryKey: key,
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_discount_coupons')
        .select('id, code, unit, value, applies_to, valid_until, max_uses, active, note')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CouponListRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (row: ReturnType<typeof couponToRow> & { ok: true }) => {
      const { error } = await supabase.from('class_discount_coupons').insert({ tenant_id: tenant!.id, ...row.row });
      if (error) throw error;
    },
    onSuccess: async () => {
      setForm(DEFAULT_COUPON_INPUT);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: { code?: string }) => setDuplicate(error?.code === UNIQUE_VIOLATION),
  });

  const toggle = useMutation({
    mutationFn: async (row: CouponListRow) => {
      const { error } = await supabase
        .from('class_discount_coupons')
        .update({ active: !row.active, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (!tenant) return null;

  const set = <K extends keyof CouponInput>(k: K, v: CouponInput[K]) => {
    setInvalid([]);
    setDuplicate(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = couponToRow(form);
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    add.mutate(result);
  };

  const rows = list.data ?? [];
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t('settings.class_discounts.coupons_title')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('settings.class_discounts.coupons_hint')}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.class_discounts.coupons_empty')}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={row.active ? '' : 'text-muted-foreground line-through'}>
                <span dir="ltr" className="font-mono font-medium">
                  {row.code}
                </span>{' '}
                · {amountText(row.unit, row.value)} ·{' '}
                {t(`settings.class_discounts.coupon_${row.applies_to}`)}
                {row.valid_until && <> · {t('settings.class_discounts.coupon_until', { date: row.valid_until })}</>}
                {row.max_uses != null && <> · {t('settings.class_discounts.coupon_uses', { count: row.max_uses })}</>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate(row)}>
                {row.active ? t('settings.class_discounts.coupon_turn_off') : t('settings.class_discounts.coupon_turn_on')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="space-y-3" onSubmit={onAdd}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-code`} className="block text-sm font-medium">
              {t('settings.class_discounts.coupon_code')}
            </label>
            <Input
              id={`${id}-code`}
              dir="ltr"
              className="w-40 uppercase"
              autoComplete="off"
              value={form.code}
              aria-invalid={invalid.includes('code') || duplicate || undefined}
              onChange={(e) => set('code', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span id={`${id}-unit`} className="block text-sm font-medium">
              {t('settings.class_discounts.unit_label')}
            </span>
            <UnitSelect value={form.unit} onChange={(u) => set('unit', u)} labelledBy={`${id}-unit`} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-value`} className="block text-sm font-medium">
              {t('settings.class_discounts.value')}
            </label>
            <Input
              id={`${id}-value`}
              type="number"
              className="w-24"
              inputMode={form.unit === 'amount' ? 'decimal' : 'numeric'}
              value={form.value}
              aria-invalid={invalid.includes('value') || undefined}
              onChange={(e) => set('value', e.target.value)}
            />
          </div>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t('settings.class_discounts.coupon_applies')}</legend>
          {(['every_month', 'first_payment'] as const).map((value) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-applies`}
                className="mt-1"
                checked={form.applies_to === value}
                onChange={() => set('applies_to', value)}
              />
              <span>{t(`settings.class_discounts.coupon_${value}`)}</span>
            </label>
          ))}
        </fieldset>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t('settings.class_discounts.coupon_more')}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor={`${id}-until`} className="block text-sm font-medium">
                {t('settings.class_discounts.coupon_valid_until')}
              </label>
              <Input
                id={`${id}-until`}
                type="date"
                value={form.valid_until}
                onChange={(e) => set('valid_until', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-uses`} className="block text-sm font-medium">
                {t('settings.class_discounts.coupon_max_uses')}
              </label>
              <Input
                id={`${id}-uses`}
                type="number"
                min={1}
                className="w-24"
                value={form.max_uses}
                aria-invalid={invalid.includes('max_uses') || undefined}
                onChange={(e) => set('max_uses', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-note`} className="block text-sm font-medium">
                {t('settings.class_discounts.note')}
              </label>
              <Input id={`${id}-note`} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>
          </div>
        </details>
        <Button type="submit" size="sm" variant="outline" isLoading={add.isPending}>
          {t('settings.class_discounts.coupons_add')}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t('settings.class_discounts.coupons_on_top')}</p>
      <p aria-live="polite" className="text-xs text-error">
        {invalid.includes('code')
          ? t('settings.class_discounts.invalid_code')
          : invalid.includes('value')
            ? t(`settings.class_discounts.invalid_${form.unit}`)
            : invalid.includes('max_uses')
              ? t('settings.class_discounts.invalid_uses')
              : duplicate
                ? t('settings.class_discounts.duplicate_code')
                : add.error || toggle.error || list.error
                  ? t('settings.class_discounts.error')
                  : ''}
      </p>
    </section>
  );
}
