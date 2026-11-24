import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormInput, FormTextarea } from '@/components/ui/form';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export interface LeadThankYou {
  enabled: boolean;
  subject_en: string;
  body_en: string;
  subject_he: string;
  body_he: string;
}

type TextField = Exclude<keyof LeadThankYou, 'enabled'>;
const TEXT_FIELDS: TextField[] = ['subject_en', 'body_en', 'subject_he', 'body_he'];

/**
 * The saved settings, with any empty text filled from the ready-made wording
 * (in both languages), so the studio edits a full email, never a blank one.
 */
export function withThankYouDefaults(raw: unknown, defaults: Record<TextField, string>): LeadThankYou {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: LeadThankYou = { enabled: obj.enabled === true, ...defaults };
  for (const field of TEXT_FIELDS) {
    const value = obj[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = value;
  }
  return out;
}

/**
 * Leads -> Enquiry settings: "Thank-you email to new sign-ups". When on, each
 * new sign-up from the website form gets this email straight away, in the
 * language they used. Saved to tenants.lead_thank_you; crm-lead-capture sends it.
 */
export function LeadThankYouSetting() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [draft, setDraft] = useState<LeadThankYou | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const defaults: Record<TextField, string> = {
    subject_en: i18n.t('settings.lead_thank_you.default_subject', { lng: 'en' }),
    body_en: i18n.t('settings.lead_thank_you.default_body', { lng: 'en' }),
    subject_he: i18n.t('settings.lead_thank_you.default_subject', { lng: 'he' }),
    body_he: i18n.t('settings.lead_thank_you.default_body', { lng: 'he' }),
  };

  const saved = useQuery({
    queryKey: ['lead-thank-you', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('lead_thank_you').eq('id', tenant!.id).single();
      if (error) throw error;
      return (data as { lead_thank_you?: unknown } | null)?.lead_thank_you ?? {};
    },
  });

  useEffect(() => {
    if (saved.data === undefined) return;
    setDraft(withThankYouDefaults(saved.data, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults come from static translations
  }, [saved.data]);

  const save = useMutation({
    mutationFn: async (next: LeadThankYou) => {
      const { error } = await supabase.from('tenants').update({ lead_thank_you: next as never }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.lead_thank_you.saved'));
      await queryClient.invalidateQueries({ queryKey: ['lead-thank-you'] });
    },
    onError: () => setMessage(t('settings.lead_thank_you.error')),
  });

  if (!tenant) return null;
  if (saved.isLoading || !draft) return <p role="status">{t('common.loading')}</p>;

  const set = (field: TextField, value: string) => {
    setMessage(null);
    setDraft({ ...draft, [field]: value });
  };

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.lead_thank_you.title')}
      </h2>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.enabled}
          onChange={(e) => {
            setMessage(null);
            setDraft({ ...draft, enabled: e.target.checked });
          }}
          aria-describedby={`${id}-hint`}
        />
        <span>{t('settings.lead_thank_you.label')}</span>
      </label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t('settings.lead_thank_you.hint')}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {(['en', 'he'] as const).map((lng) => (
          <div key={lng} className="space-y-2" dir={lng === 'he' ? 'rtl' : 'ltr'} lang={lng}>
            <FormInput
              htmlFor={`${id}-subject-${lng}`}
              label={t(`settings.lead_thank_you.subject_${lng}`)}
              value={draft[`subject_${lng}`]}
              maxLength={200}
              onChange={(e) => set(`subject_${lng}`, e.target.value)}
            />
            <FormTextarea
              htmlFor={`${id}-body-${lng}`}
              label={t(`settings.lead_thank_you.body_${lng}`)}
              value={draft[`body_${lng}`]}
              rows={10}
              maxLength={5000}
              onChange={(e) => set(`body_${lng}`, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {t('common.save')}
        </Button>
        {message && (
          <p role="status" aria-live="polite" className="text-sm">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
