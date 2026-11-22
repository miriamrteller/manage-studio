import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormTextarea } from '@/components/ui/form';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export interface ClassReminders {
  morning: boolean;
  no_class: boolean;
  wear_en: string;
  wear_he: string;
  closed_dates: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseClassRemindersSetting(raw: unknown): ClassReminders {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dates = Array.isArray(obj.closed_dates)
    ? [...new Set(obj.closed_dates.filter((d): d is string => typeof d === 'string' && ISO_DATE.test(d)))].sort()
    : [];
  return {
    morning: obj.morning === true,
    no_class: obj.no_class === true,
    wear_en: typeof obj.wear_en === 'string' ? obj.wear_en : '',
    wear_he: typeof obj.wear_he === 'string' ? obj.wear_he : '',
    closed_dates: dates,
  };
}

/**
 * Notifications -> Automatic emails: the morning-of class reminder and the
 * "no class" notice 6 days ahead (the day after the previous class), to enrolled families. Saved to
 * tenants.class_reminders; run-class-reminders sends them every morning.
 * Holidays are skipped automatically; closed dates add the studio's own days off.
 */
export function ClassRemindersSetting() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [draft, setDraft] = useState<ClassReminders | null>(null);
  const [newDate, setNewDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saved = useQuery({
    queryKey: ['class-reminders', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('class_reminders').eq('id', tenant!.id).single();
      if (error) throw error;
      return parseClassRemindersSetting((data as { class_reminders?: unknown } | null)?.class_reminders);
    },
  });

  useEffect(() => {
    if (saved.data) setDraft(saved.data);
  }, [saved.data]);

  const save = useMutation({
    mutationFn: async (next: ClassReminders) => {
      const { error } = await supabase.from('tenants').update({ class_reminders: next as never }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('pages.notifications.reminders.saved'));
      await queryClient.invalidateQueries({ queryKey: ['class-reminders'] });
    },
    onError: () => setMessage(t('pages.notifications.reminders.error')),
  });

  if (!tenant) return null;
  if (saved.isLoading || !draft) return <p role="status">{t('common.loading')}</p>;

  const update = (patch: Partial<ClassReminders>) => {
    setMessage(null);
    setDraft({ ...draft, ...patch });
  };
  const addDate = () => {
    if (!ISO_DATE.test(newDate)) return;
    update({ closed_dates: [...new Set([...draft.closed_dates, newDate])].sort() });
    setNewDate('');
  };
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('pages.notifications.reminders.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('pages.notifications.reminders.description')}</p>
      </div>

      <div className="flex items-start gap-2 text-sm">
        <input
          id={`${id}-morning`}
          type="checkbox"
          className="mt-1"
          checked={draft.morning}
          onChange={(e) => update({ morning: e.target.checked })}
          aria-describedby={`${id}-morning-hint`}
        />
        <div>
          <label htmlFor={`${id}-morning`} className="font-medium">
            {t('pages.notifications.reminders.morning_label')}
          </label>
          <p id={`${id}-morning-hint`} className="text-xs text-muted-foreground">
            {t('pages.notifications.reminders.morning_hint')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(['en', 'he'] as const).map((lng) => (
          <div key={lng} dir={lng === 'he' ? 'rtl' : 'ltr'} lang={lng}>
            <FormTextarea
              htmlFor={`${id}-wear-${lng}`}
              label={t(`pages.notifications.reminders.wear_${lng}`)}
              value={draft[`wear_${lng}`]}
              rows={3}
              maxLength={1000}
              onChange={(e) => update({ [`wear_${lng}`]: e.target.value } as Partial<ClassReminders>)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 text-sm">
        <input
          id={`${id}-no_class`}
          type="checkbox"
          className="mt-1"
          checked={draft.no_class}
          onChange={(e) => update({ no_class: e.target.checked })}
          aria-describedby={`${id}-no_class-hint`}
        />
        <div>
          <label htmlFor={`${id}-no_class`} className="font-medium">
            {t('pages.notifications.reminders.no_class_label')}
          </label>
          <p id={`${id}-no_class-hint`} className="text-xs text-muted-foreground">
            {t('pages.notifications.reminders.no_class_hint')}
          </p>
        </div>
      </div>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="text-sm font-medium px-1">{t('pages.notifications.reminders.closed_legend')}</legend>
        <p className="text-xs text-muted-foreground">{t('pages.notifications.reminders.closed_hint')}</p>
        {draft.closed_dates.length > 0 && (
          <ul className="space-y-1 text-sm">
            {draft.closed_dates.map((d) => (
              <li key={d} className="flex items-center gap-2">
                <span>{dayLabel(d)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ closed_dates: draft.closed_dates.filter((x) => x !== d) })}
                  aria-label={t('pages.notifications.reminders.remove_date', { date: dayLabel(d) })}
                >
                  {t('common.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm" htmlFor={`${id}-date`}>
            {t('pages.notifications.reminders.add_date')}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className="rounded border border-gray-300 px-2 py-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={addDate} disabled={!ISO_DATE.test(newDate)}>
            {t('common.add')}
          </Button>
        </div>
      </fieldset>

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
