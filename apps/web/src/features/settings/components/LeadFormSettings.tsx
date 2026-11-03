import { useEffect, useId, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CUSTOM_TYPES,
  MAX_CUSTOM_QUESTIONS,
  presetKeysFor,
  PRESET_QUESTIONS,
  leadFormConfigErrors,
  leadFormKindFor,
  parseLeadFormConfig,
  type Bilingual,
  type CustomQuestion,
  type LeadFormConfig,
  type PresetKey,
} from '@shared/index';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

/** Options are typed one per line as "English | עברית" (one side is enough). */
export function parseOptionLines(text: string): Bilingual[] {
  return text
    .split('\n')
    .map((line) => {
      const [en = '', he = ''] = line.split('|').map((part) => part.trim());
      return en || he ? { en: en || he, he: he || en } : null;
    })
    .filter((o): o is Bilingual => o !== null);
}

export function optionLines(options: Bilingual[] | undefined): string {
  return (options ?? []).map((o) => (o.he && o.he !== o.en ? `${o.en} | ${o.he}` : o.en)).join('\n');
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') || 'q';
}

const SHORT_FORM_LIMIT = 4;

/**
 * Settings → "Questions on your enquiry form": ready-made questions for this
 * kind of studio (on/off, required), then up to 5 of the studio's own.
 * Saved to tenants.lead_form; the public form and crm-lead-capture read it.
 */
export function LeadFormSettings() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const kind = leadFormKindFor(tenant?.vertical, tenant?.business_preset);
  const lang = i18n.language?.startsWith('he') ? 'he' : 'en';

  const saved = useQuery({
    queryKey: ['lead-form-config', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async (): Promise<LeadFormConfig> => {
      const { data, error } = await supabase.from('tenants').select('lead_form').eq('id', tenant!.id).single();
      if (error) throw error;
      return parseLeadFormConfig((data as { lead_form?: unknown } | null)?.lead_form);
    },
  });

  const [config, setConfig] = useState<LeadFormConfig>({ presets: {}, custom: [] });
  const [optionText, setOptionText] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!saved.data) return;
    setConfig(saved.data);
    setOptionText(Object.fromEntries(saved.data.custom.map((q) => [q.id, optionLines(q.options)])));
  }, [saved.data]);

  const save = useMutation({
    mutationFn: async (next: LeadFormConfig) => {
      const { error } = await supabase.from('tenants').update({ lead_form: next as never }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.lead_form.saved'));
      await queryClient.invalidateQueries({ queryKey: ['lead-form-config'] });
      await queryClient.invalidateQueries({ queryKey: ['lead-form-questions'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;
  // Wait for the saved questions, so nothing typed before they arrive is overwritten.
  if (saved.isLoading) return <p role="status">{t('common.loading')}</p>;
  if (saved.isError) {
    return (
      <div className="alert-error" role="alert">
        {t('settings.lead_form.load_error')}
      </div>
    );
  }

  const setPreset = (key: PresetKey, patch: Partial<{ enabled: boolean; required: boolean }>) =>
    setConfig((c) => {
      const current = c.presets[key] ?? { enabled: false, required: false };
      const next = { ...current, ...patch };
      if (!next.enabled) next.required = false;
      return { ...c, presets: { ...c.presets, [key]: next } };
    });

  const setCustom = (index: number, patch: Partial<CustomQuestion>) =>
    setConfig((c) => ({ ...c, custom: c.custom.map((q, i) => (i === index ? { ...q, ...patch } : q)) }));

  const move = (index: number, delta: number) =>
    setConfig((c) => {
      const to = index + delta;
      if (to < 0 || to >= c.custom.length) return c;
      const custom = [...c.custom];
      [custom[index], custom[to]] = [custom[to], custom[index]];
      return { ...c, custom };
    });

  const add = () =>
    setConfig((c) =>
      c.custom.length >= MAX_CUSTOM_QUESTIONS
        ? c
        : { ...c, custom: [...c.custom, { id: newId(), type: 'short_text', label: { en: '', he: '' }, required: false }] },
    );

  const remove = (index: number) => setConfig((c) => ({ ...c, custom: c.custom.filter((_, i) => i !== index) }));

  const onSave = () => {
    setMessage(null);
    const next: LeadFormConfig = {
      presets: config.presets,
      custom: config.custom.map((q) =>
        q.type === 'select' || q.type === 'multi_select'
          ? { ...q, options: parseOptionLines(optionText[q.id] ?? '') }
          : { ...q, options: undefined },
      ),
    };
    const problems = leadFormConfigErrors(next);
    setErrors(problems);
    if (problems.length > 0) return;
    save.mutate(next);
  };

  // The kind's set plus any extra ready-made questions the studio's skin gave it.
  const presetKeys = presetKeysFor(config, kind);
  const extraCount = presetKeys.filter((k) => config.presets[k]?.enabled).length + config.custom.length;

  return (
    <section className="space-y-5" aria-labelledby={`${id}-title`}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
            {t('settings.lead_form.title')}
          </h2>
          <InfoTip label={t('pages.crm.help.tip_label', { topic: t('settings.lead_form.title') })}>
            {t('pages.crm.help.tip_questions')}
          </InfoTip>
        </div>
        <p className="text-sm text-muted-foreground">{t('settings.lead_form.description')}</p>
        <p className="text-sm" role="status">
          {t('settings.lead_form.short_hint', { count: extraCount })}
          {extraCount > SHORT_FORM_LIMIT && <> {t('settings.lead_form.long_warning')}</>}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-medium">{t('settings.lead_form.ready_made')}</legend>
        {presetKeys.map((key) => {
          const def = PRESET_QUESTIONS[key];
          const setting = config.presets[key] ?? { enabled: false, required: false };
          return (
            <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <label className="inline-flex items-center gap-2 min-w-56">
                <input type="checkbox" checked={setting.enabled} onChange={(e) => setPreset(key, { enabled: e.target.checked })} />
                {def.label[lang]}
              </label>
              <label className="inline-flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={setting.required}
                  disabled={!setting.enabled}
                  onChange={(e) => setPreset(key, { required: e.target.checked })}
                />
                {t('settings.lead_form.required')}
              </label>
            </div>
          );
        })}
        {kind === 'classes' && <p className="text-xs text-muted-foreground">{t('settings.lead_form.classes_hint')}</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-medium">
          {t('settings.lead_form.custom', { count: config.custom.length, max: MAX_CUSTOM_QUESTIONS })}
        </legend>
        {config.custom.map((q, index) => {
          const base = `${id}-c-${q.id}`;
          const hasOptions = q.type === 'select' || q.type === 'multi_select';
          return (
            <div key={q.id} className="card border p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${base}-en`} className="block text-sm font-medium mb-1">
                    {t('settings.lead_form.label_en')}
                  </label>
                  <input
                    id={`${base}-en`}
                    dir="ltr"
                    maxLength={120}
                    className="w-full border rounded px-3 py-2"
                    value={q.label.en}
                    onChange={(e) => setCustom(index, { label: { ...q.label, en: e.target.value } })}
                  />
                </div>
                <div>
                  <label htmlFor={`${base}-he`} className="block text-sm font-medium mb-1">
                    {t('settings.lead_form.label_he')}
                  </label>
                  <input
                    id={`${base}-he`}
                    dir="rtl"
                    maxLength={120}
                    className="w-full border rounded px-3 py-2"
                    value={q.label.he}
                    onChange={(e) => setCustom(index, { label: { ...q.label, he: e.target.value } })}
                  />
                </div>
                <div>
                  <label htmlFor={`${base}-type`} className="block text-sm font-medium mb-1">
                    {t('settings.lead_form.type')}
                  </label>
                  <select
                    id={`${base}-type`}
                    className="w-full border rounded px-3 py-2"
                    value={q.type}
                    onChange={(e) => setCustom(index, { type: e.target.value as CustomQuestion['type'] })}
                  >
                    {CUSTOM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`settings.lead_form.type_${type}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 text-sm self-end pb-2">
                  <input type="checkbox" checked={q.required} onChange={(e) => setCustom(index, { required: e.target.checked })} />
                  {t('settings.lead_form.required')}
                </label>
              </div>
              {hasOptions && (
                <div>
                  <label htmlFor={`${base}-options`} className="block text-sm font-medium mb-1">
                    {t('settings.lead_form.options')}
                  </label>
                  <textarea
                    id={`${base}-options`}
                    rows={3}
                    className="w-full border rounded px-3 py-2"
                    aria-describedby={`${base}-options-hint`}
                    value={optionText[q.id] ?? ''}
                    onChange={(e) => setOptionText((o) => ({ ...o, [q.id]: e.target.value }))}
                  />
                  <p id={`${base}-options-hint`} className="text-xs text-muted-foreground">
                    {t('settings.lead_form.options_hint')}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => move(index, -1)} disabled={index === 0}>
                  {t('settings.lead_form.move_up')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => move(index, 1)} disabled={index === config.custom.length - 1}>
                  {t('settings.lead_form.move_down')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(index)}>
                  {t('settings.lead_form.remove')}
                </Button>
              </div>
            </div>
          );
        })}
        <Button variant="outline" onClick={add} disabled={config.custom.length >= MAX_CUSTOM_QUESTIONS}>
          {t('settings.lead_form.add')}
        </Button>
      </fieldset>

      {errors.length > 0 && (
        <div className="alert-error" role="alert">
          {t('settings.lead_form.errors')}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={onSave} disabled={save.isPending || saved.isLoading}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm">
          {message}
        </span>
      </div>
    </section>
  );
}
