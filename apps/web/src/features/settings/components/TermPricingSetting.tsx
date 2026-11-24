import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';

/**
 * Settings › Online payments › "Paying by the term" (owner decision, 24 Nov 2026). For classes
 * with a price per class: the up-front discount, the rounding of monthly payments, the early
 * enrolment dates, the sister discount and the trial class whose payment comes off the first
 * payment. Every discount is applied automatically; nothing is typed per family.
 */

interface TermPricingRow {
  upfront_discount_pct: number;
  round_minor: number;
  early_enrol_by: string | null;
  early_until: string | null;
  sibling_discount_pct: number;
  sibling_from: number;
  trial_offering_id: string | null;
}

const KEY = ['term-pricing'];

export function TermPricingSetting() {
  const { t } = useTranslation();
  const id = useId();
  const tenant = useTenant();
  const tenantId = tenant?.id;

  const rules = useQuery({
    queryKey: [...KEY, tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TermPricingRow | null> => {
      const { data, error } = await supabase
        .from('tenant_term_pricing')
        .select('upfront_discount_pct, round_minor, early_enrol_by, early_until, sibling_discount_pct, sibling_from, trial_offering_id')
        .eq('tenant_id', tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data as TermPricingRow | null) ?? null;
    },
  });

  const offerings = useQuery({
    queryKey: [...KEY, 'offerings', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, name')
        .eq('tenant_id', tenantId!)
        .neq('status', 'cancelled')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const [upfront, setUpfront] = useState('0');
  const [round, setRound] = useState('5');
  const [earlyBy, setEarlyBy] = useState('');
  const [earlyUntil, setEarlyUntil] = useState('');
  const [sister, setSister] = useState('0');
  const [sisterFrom, setSisterFrom] = useState('2');
  const [trial, setTrial] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const r = rules.data;
    if (!r) return;
    setUpfront(String(Number(r.upfront_discount_pct)));
    setRound(String(r.round_minor / 100));
    setEarlyBy(r.early_enrol_by ?? '');
    setEarlyUntil(r.early_until ?? '');
    setSister(String(Number(r.sibling_discount_pct)));
    setSisterFrom(String(r.sibling_from));
    setTrial(r.trial_offering_id ?? '');
  }, [rules.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tenant_term_pricing').upsert(
        {
          tenant_id: tenantId!,
          upfront_discount_pct: Number(upfront) || 0,
          round_minor: Math.max(1, Math.round((Number(round) || 0) * 100)),
          early_enrol_by: earlyBy || null,
          early_until: earlyUntil || null,
          sibling_discount_pct: Number(sister) || 0,
          sibling_from: Math.max(2, Math.round(Number(sisterFrom) || 2)),
          trial_offering_id: trial || null,
        },
        { onConflict: 'tenant_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  if (!tenant || rules.isPending) return null;

  const pct = (v: string) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 50;
  const valid =
    pct(upfront) && pct(sister) && Number(round) > 0 && Number(round) <= 100 && Number(sisterFrom) >= 2;

  const field = (key: string, label: string, hint: string | null, input: React.ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {label}
      </label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby={`${id}-title`}>
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('settings.term_pricing.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.term_pricing.intro')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {field('upfront', t('settings.term_pricing.upfront'), null,
          <Input id={`${id}-upfront`} type="number" min={0} max={50} className="max-w-32" value={upfront}
            onChange={(e) => { setUpfront(e.target.value); setSaved(false); }} />)}
        {field('round', t('settings.term_pricing.round'), t('settings.term_pricing.round_hint'),
          <Input id={`${id}-round`} type="number" min={0.01} step="0.01" className="max-w-32" value={round}
            onChange={(e) => { setRound(e.target.value); setSaved(false); }} />)}
        {field('early-by', t('settings.term_pricing.early_by'), t('settings.term_pricing.early_by_hint'),
          <Input id={`${id}-early-by`} type="date" className="max-w-48" value={earlyBy}
            onChange={(e) => { setEarlyBy(e.target.value); setSaved(false); }} />)}
        {field('early-until', t('settings.term_pricing.early_until'), t('settings.term_pricing.early_until_hint'),
          <Input id={`${id}-early-until`} type="date" className="max-w-48" value={earlyUntil}
            onChange={(e) => { setEarlyUntil(e.target.value); setSaved(false); }} />)}
        {field('sister', t('settings.term_pricing.sister'), null,
          <Input id={`${id}-sister`} type="number" min={0} max={50} className="max-w-32" value={sister}
            onChange={(e) => { setSister(e.target.value); setSaved(false); }} />)}
        {field('sister-from', t('settings.term_pricing.sister_from'), t('settings.term_pricing.sister_from_hint'),
          <Input id={`${id}-sister-from`} type="number" min={2} max={10} className="max-w-32" value={sisterFrom}
            onChange={(e) => { setSisterFrom(e.target.value); setSaved(false); }} />)}
        {field('trial', t('settings.term_pricing.trial'), t('settings.term_pricing.trial_hint'),
          <select id={`${id}-trial`} className="form-input w-full" value={trial}
            onChange={(e) => { setTrial(e.target.value); setSaved(false); }}>
            <option value="">{t('settings.term_pricing.trial_none')}</option>
            {(offerings.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>)}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" size="sm" disabled={!valid || save.isPending} isLoading={save.isPending}
          onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
        {saved && <span className="text-sm text-muted-foreground" role="status">{t('settings.term_pricing.saved')}</span>}
        {save.isError && <span className="text-sm text-destructive" role="alert">{t('common.error')}</span>}
      </div>
    </section>
  );
}
