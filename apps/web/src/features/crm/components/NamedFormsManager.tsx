import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  FORM_TIME_ZONE,
  presetKeysFor,
  PRESET_QUESTIONS,
  formSlugProblem,
  leadFormIsOpen,
  leadFormKindFor,
  parseLeadFormConfig,
  suggestFormSlug,
  todayIn,
} from '@shared/index';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { useNamedForms } from '../hooks/useNamedForms';
import {
  deleteNamedForm,
  isFormSlugFree,
  listFormOfferings,
  saveNamedForm,
  uploadFormImage,
  type NamedLeadForm,
  type NamedLeadFormInput,
} from '../services/leadFormsService';
import { GetLeadsPanel } from './GetLeadsPanel';

type Draft = NamedLeadFormInput;

const EMPTY: Draft = {
  slug: '',
  name: '',
  title_en: null,
  title_he: null,
  intro_en: null,
  intro_he: null,
  image_url: null,
  question_keys: null,
  offering_id: null,
  active: true,
  ends_on: null,
};

export type FormState = 'open' | 'off' | 'ended';

export function namedFormState(form: Pick<NamedLeadForm, 'active' | 'ends_on'>, today: string): FormState {
  if (!form.active) return 'off';
  return leadFormIsOpen(form, today) ? 'open' : 'ended';
}

/** The studio's questions an admin can pick for a form: switched-on ready-made ones, then custom. */
function useStudioQuestionChoices() {
  const tenant = useTenant();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('he') ? 'he' : 'en';
  const kind = leadFormKindFor(tenant?.vertical, tenant?.business_preset);
  const query = useQuery({
    queryKey: ['lead-form-config', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('lead_form').eq('id', tenant!.id).single();
      if (error) throw error;
      return parseLeadFormConfig((data as { lead_form?: unknown } | null)?.lead_form);
    },
  });
  return useMemo(() => {
    const config = query.data;
    if (!config) return [] as Array<{ key: string; label: string }>;
    return [
      ...presetKeysFor(config, kind)
        .filter((k) => config.presets[k]?.enabled)
        .map((k) => ({ key: k as string, label: PRESET_QUESTIONS[k].label[lang] })),
      ...config.custom.map((q) => ({ key: `c_${q.id}`, label: q.label[lang] || q.label.en })),
    ];
  }, [query.data, kind, lang]);
}

/**
 * Admin → Leads → Forms: named forms at /f/<slug>, each with its own title,
 * intro, image, questions, class/package, on/off and last day, and its own
 * share links, QR and poster. /inquire stays the general form.
 */
export function NamedFormsManager() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { forms, counts, isLoading, error } = useNamedForms();
  const [editing, setEditing] = useState<NamedLeadForm | 'new' | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const today = todayIn(FORM_TIME_ZONE);
  const origin = window.location.origin;

  const remove = useMutation({
    mutationFn: (id: string) => deleteNamedForm(tenant!.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['named-lead-forms'] }),
  });

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <h1 className="text-3xl font-bold">{t('pages.crm.named_forms.title')}</h1>
            <InfoTip label={t('pages.crm.help.tip_label', { topic: t('pages.crm.named_forms.title') })}>
              {t('pages.crm.help.tip_forms')}
            </InfoTip>
          </div>
          <p className="text-sm text-muted-foreground">{t('pages.crm.named_forms.intro')}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')} disabled={editing !== null}>
          {t('pages.crm.named_forms.add')}
        </Button>
      </div>

      {editing && (
        <NamedFormEditor
          form={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error && (
        <div className="alert-error" role="alert">
          {error.message}
        </div>
      )}
      {!isLoading && forms.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground">{t('pages.crm.named_forms.empty')}</p>
      )}

      <ul className="space-y-3">
        {forms.map((form) => {
          const state = namedFormState(form, today);
          const c = counts[form.id] ?? { leads: 0, won: 0 };
          const link = `${origin}/f/${form.slug}`;
          return (
            <li key={form.id} className="card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold">
                    {form.name}{' '}
                    <span className={state === 'open' ? 'text-xs text-green-700' : 'text-xs text-muted-foreground'}>
                      {t(`pages.crm.named_forms.state_${state}`)}
                    </span>
                  </p>
                  <p className="text-sm font-mono break-all" dir="ltr">
                    {link}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('pages.crm.named_forms.counts', { leads: c.leads, won: c.won })}
                    {form.ends_on && <> · {t('pages.crm.named_forms.ends_on_short', { date: form.ends_on })}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSharing(sharing === form.id ? null : form.id)}>
                    {t('pages.crm.named_forms.share')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(form)} disabled={editing !== null}>
                    {t('pages.crm.named_forms.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t('pages.crm.named_forms.delete_confirm', { name: form.name }))) remove.mutate(form.id);
                    }}
                  >
                    {t('pages.crm.named_forms.delete')}
                  </Button>
                </div>
              </div>
              {sharing === form.id && (
                <GetLeadsPanel
                  headingLevel={3}
                  formSlug={form.slug}
                  target={{ path: `/f/${form.slug}`, title: form.title_he || form.title_en || form.name }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NamedFormEditor({ form, onDone }: { form: NamedLeadForm | null; onDone: () => void }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() =>
    form ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k as keyof Draft]])) as Draft) : EMPTY,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(form));
  const [slugFree, setSlugFree] = useState<boolean | null>(form ? true : null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const choices = useStudioQuestionChoices();
  const offerings = useQuery({
    queryKey: ['form-offerings', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => listFormOfferings(tenant!.id),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const slugProblem = formSlugProblem(draft.slug);

  // Live availability check, debounced.
  useEffect(() => {
    if (!tenant?.id || slugProblem) {
      setSlugFree(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const free = await isFormSlugFree(tenant.id, draft.slug, form?.id);
        if (!cancelled) setSlugFree(free);
      } catch {
        if (!cancelled) setSlugFree(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tenant?.id, draft.slug, slugProblem, form?.id]);

  const save = useMutation({
    mutationFn: () =>
      saveNamedForm(
        tenant!.id,
        {
          ...draft,
          name: draft.name.trim(),
          title_en: draft.title_en?.trim() || null,
          title_he: draft.title_he?.trim() || null,
          intro_en: draft.intro_en?.trim() || null,
          intro_he: draft.intro_he?.trim() || null,
          ends_on: draft.ends_on || null,
        },
        form?.id,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['named-lead-forms'] });
      onDone();
    },
    onError: (err: Error) => {
      if (err.message === 'slug_taken') setSlugFree(false);
      setMessage(err.message === 'slug_taken' ? t('pages.crm.named_forms.slug_taken') : err.message);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!draft.name.trim() || slugProblem || slugFree === false) return;
    save.mutate();
  };

  const onImage = async (file: File | undefined) => {
    if (!file || !tenant) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage(t('pages.crm.named_forms.image_too_large'));
      return;
    }
    setUploading(true);
    try {
      set('image_url', await uploadFormImage(tenant.id, file));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const allQuestions = draft.question_keys === null;
  const slugHint =
    slugProblem && draft.slug
      ? t(`pages.crm.named_forms.slug_${slugProblem}`)
      : slugFree === false
        ? t('pages.crm.named_forms.slug_taken')
        : slugFree === true && draft.slug
          ? t('pages.crm.named_forms.slug_free')
          : t('pages.crm.named_forms.slug_hint');

  return (
    <form onSubmit={onSubmit} className="card p-4 space-y-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">
        {form ? t('pages.crm.named_forms.edit_title') : t('pages.crm.named_forms.new_title')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className="block text-sm font-medium mb-1">
            {t('pages.crm.named_forms.name')} *
          </label>
          <input
            id={`${id}-name`}
            required
            maxLength={80}
            className="w-full border rounded px-3 py-2"
            value={draft.name}
            aria-describedby={`${id}-name-hint`}
            onChange={(e) => {
              set('name', e.target.value);
              if (!slugTouched) set('slug', suggestFormSlug(e.target.value));
            }}
          />
          <p id={`${id}-name-hint`} className="text-xs text-muted-foreground mt-1">
            {t('pages.crm.named_forms.name_hint')}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-slug`} className="block text-sm font-medium mb-1">
            {t('pages.crm.named_forms.slug')} *
          </label>
          <div className="flex items-center gap-1" dir="ltr">
            <span className="text-sm text-muted-foreground">/f/</span>
            <input
              id={`${id}-slug`}
              required
              maxLength={40}
              className="w-full border rounded px-3 py-2 font-mono"
              value={draft.slug}
              aria-invalid={Boolean(draft.slug && slugProblem) || slugFree === false || undefined}
              aria-describedby={`${id}-slug-hint`}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
            />
          </div>
          <p id={`${id}-slug-hint`} aria-live="polite" className="text-xs text-muted-foreground mt-1">
            {slugHint}
          </p>
        </div>
        <TextField id={`${id}-title-en`} label={t('pages.crm.named_forms.title_en')} value={draft.title_en} dir="ltr" max={120} onChange={(v) => set('title_en', v)} />
        <TextField id={`${id}-title-he`} label={t('pages.crm.named_forms.title_he')} value={draft.title_he} dir="rtl" max={120} onChange={(v) => set('title_he', v)} />
        <TextField id={`${id}-intro-en`} label={t('pages.crm.named_forms.intro_en')} value={draft.intro_en} dir="ltr" max={600} multiline onChange={(v) => set('intro_en', v)} />
        <TextField id={`${id}-intro-he`} label={t('pages.crm.named_forms.intro_he')} value={draft.intro_he} dir="rtl" max={600} multiline onChange={(v) => set('intro_he', v)} />
        <div>
          <label htmlFor={`${id}-offering`} className="block text-sm font-medium mb-1">
            {t('pages.crm.named_forms.offering')}
          </label>
          <select
            id={`${id}-offering`}
            className="w-full border rounded px-3 py-2"
            value={draft.offering_id ?? ''}
            onChange={(e) => set('offering_id', e.target.value || null)}
          >
            <option value="">{t('pages.crm.named_forms.offering_none')}</option>
            {(offerings.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-ends`} className="block text-sm font-medium mb-1">
            {t('pages.crm.named_forms.ends_on')}
          </label>
          <input
            id={`${id}-ends`}
            type="date"
            className="w-full border rounded px-3 py-2"
            value={draft.ends_on ?? ''}
            aria-describedby={`${id}-ends-hint`}
            onChange={(e) => set('ends_on', e.target.value || null)}
          />
          <p id={`${id}-ends-hint`} className="text-xs text-muted-foreground mt-1">
            {t('pages.crm.named_forms.ends_on_hint')}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-image`} className="block text-sm font-medium">
          {t('pages.crm.named_forms.image')}
        </label>
        <p className="text-xs text-muted-foreground">{t('pages.crm.named_forms.image_hint')}</p>
        {draft.image_url && <img src={draft.image_url} alt="" className="h-24 rounded border object-cover" />}
        <div className="flex flex-wrap items-center gap-2">
          <input id={`${id}-image`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onImage(e.target.files?.[0])} />
          {draft.image_url && (
            <Button variant="outline" size="sm" type="button" onClick={() => set('image_url', null)}>
              {t('pages.crm.named_forms.image_remove')}
            </Button>
          )}
          {uploading && <span role="status">{t('common.loading')}</span>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('pages.crm.named_forms.questions')}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allQuestions}
            onChange={(e) => set('question_keys', e.target.checked ? null : choices.map((c) => c.key))}
          />
          {t('pages.crm.named_forms.questions_all')}
        </label>
        {!allQuestions &&
          choices.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm ps-6">
              <input
                type="checkbox"
                checked={draft.question_keys?.includes(c.key) ?? false}
                onChange={(e) =>
                  set(
                    'question_keys',
                    e.target.checked
                      ? [...(draft.question_keys ?? []), c.key]
                      : (draft.question_keys ?? []).filter((k) => k !== c.key),
                  )
                }
              />
              {c.label}
            </label>
          ))}
        {choices.length === 0 && <p className="text-xs text-muted-foreground">{t('pages.crm.named_forms.questions_none')}</p>}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
        {t('pages.crm.named_forms.active')}
      </label>

      {message && (
        <div className="alert-error" role="alert">
          {message}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending || uploading || !draft.name.trim() || Boolean(slugProblem) || slugFree === false}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  dir,
  max,
  multiline,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  dir: 'ltr' | 'rtl';
  max: number;
  multiline?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} dir={dir} rows={3} maxLength={max} className="w-full border rounded px-3 py-2" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      ) : (
        <input id={id} dir={dir} maxLength={max} className="w-full border rounded px-3 py-2" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      )}
    </div>
  );
}
