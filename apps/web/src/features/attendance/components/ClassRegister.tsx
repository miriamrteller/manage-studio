import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import queryClient from '@/lib/query-client';
import { ClassCardRegister } from '@/features/class-cards/components/ClassCardRegister';
import { useClassCardsEnabled } from '@/features/class-cards/hooks/useClassCardsEnabled';
import { fetchClassRegister, lastSessionDate, setClassAttendance, type RegisterStudent } from '../service';

/**
 * The register for one class date: mark each enrolled student here or not here
 * (tap the chosen button again to clear it), or everyone at once. When class
 * cards are on, the card holders' register is shown below for the same date.
 */
export function ClassRegister({
  offeringId,
  className,
  dayOfWeek,
  isAdmin,
  initialDate,
}: {
  offeringId: string;
  className: string;
  dayOfWeek: number | null;
  isAdmin: boolean;
  initialDate?: string;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const classCardsOn = useClassCardsEnabled();
  const [date, setDate] = useState(() => initialDate ?? lastSessionDate(dayOfWeek));
  const [failed, setFailed] = useState(false);
  const key = ['attendance', 'register', offeringId, date];

  const register = useQuery({ queryKey: key, queryFn: () => fetchClassRegister(offeringId, date) });

  const mark = useMutation({
    mutationFn: ({ ids, attended }: { ids: string[]; attended: boolean | null }) =>
      setClassAttendance(offeringId, date, ids, attended),
    onMutate: () => setFailed(false),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: () => setFailed(true),
  });

  const data = register.data;
  const students = data?.students ?? [];
  const here = students.filter((s) => s.attended === true).length;
  const away = students.filter((s) => s.attended === false).length;
  const unmarked = students.filter((s) => s.attended === null && s.enrolled);

  const toggle = (s: RegisterStudent, attended: boolean) =>
    mark.mutate({ ids: [s.person_id], attended: s.attended === attended ? null : attended });

  return (
    <section className="space-y-4 border-t p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-semibold">
        {t('attendance.register.title', { name: className })}
      </h3>
      <label className="block text-sm">
        {t('attendance.register.date')}
        <input
          type="date"
          className="mt-1 block rounded border border-border px-3 py-2"
          value={date}
          lang={i18n.language}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </label>

      {register.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('attendance.register.load_error')}
        </p>
      )}

      {data && !data.runs && (
        <p className="text-sm text-muted-foreground">{t('attendance.register.no_class_that_day')}</p>
      )}

      {data && data.runs && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {students.length === 0
                ? t('attendance.register.nobody')
                : t('attendance.register.summary', { here, away, unmarked: unmarked.length })}
            </p>
            {unmarked.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={mark.isPending}
                onClick={() => mark.mutate({ ids: unmarked.map((s) => s.person_id), attended: true })}
              >
                {t('attendance.register.everyone_here')}
              </Button>
            )}
          </div>

          {students.length > 0 && (
            <ul className="space-y-2">
              {students.map((s) => (
                <li key={s.person_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {!s.enrolled && (
                      <p className="text-xs text-muted-foreground">{t('attendance.register.left_class')}</p>
                    )}
                  </div>
                  <div className="flex gap-2" role="group" aria-label={t('attendance.register.mark_for', { name: s.name })}>
                    <Button
                      size="sm"
                      variant={s.attended === true ? 'primary' : 'outline'}
                      aria-pressed={s.attended === true}
                      disabled={mark.isPending}
                      onClick={() => toggle(s, true)}
                    >
                      {t('attendance.register.here')}
                    </Button>
                    <Button
                      size="sm"
                      variant={s.attended === false ? 'primary' : 'outline'}
                      aria-pressed={s.attended === false}
                      disabled={mark.isPending}
                      onClick={() => toggle(s, false)}
                    >
                      {t('attendance.register.not_here')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {failed && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {t('attendance.register.error')}
        </p>
      )}

      {classCardsOn && data?.runs && (
        <ClassCardRegister
          offeringId={offeringId}
          className={className}
          dayOfWeek={dayOfWeek}
          isAdmin={isAdmin}
          date={date}
        />
      )}
    </section>
  );
}
