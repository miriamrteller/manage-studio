import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import queryClient from '@/lib/query-client';
import {
  checkInWithCard,
  fetchClassCardRegister,
  nextSessionDate,
  setVisitStatus,
  type RegisterVisit,
} from '../service';

/**
 * Class register for card holders: who booked a session, tick them in, mark a no-show, give a
 * class back, and tick in a walk-in (one class comes off their card).
 */
export function ClassCardRegister({
  offeringId,
  className,
  dayOfWeek,
  isAdmin,
}: {
  offeringId: string;
  className: string;
  dayOfWeek: number | null;
  isAdmin: boolean;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [date, setDate] = useState(() => nextSessionDate(dayOfWeek));
  const [walkInCard, setWalkInCard] = useState('');
  const [failed, setFailed] = useState(false);
  const key = ['class-cards', 'register', offeringId, date];

  const register = useQuery({ queryKey: key, queryFn: () => fetchClassCardRegister(offeringId, date) });

  const act = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    onMutate: () => setFailed(false),
    onSuccess: async () => {
      setWalkInCard('');
      await queryClient.invalidateQueries({ queryKey: ['class-cards'] });
    },
    onError: () => setFailed(true),
  });

  const data = register.data;
  const here = new Set((data?.visits ?? []).filter((v) => v.status !== 'late_cancelled').map((v) => v.person_id));
  const walkInOptions = (data?.cards ?? []).filter((c) => !here.has(c.person_id));

  const statusText = (v: RegisterVisit) =>
    v.status === 'attended'
      ? v.walk_in
        ? t('class_cards.register.walked_in')
        : t('class_cards.register.came')
      : t(`class_cards.register.status_${v.status}`);

  return (
    <section className="space-y-3 border-t p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-semibold">
        {t('class_cards.register.title', { name: className })}
      </h3>
      <label className="block text-sm">
        {t('class_cards.register.date')}
        <input
          type="date"
          className="mt-1 block rounded border border-border px-3 py-2"
          value={date}
          lang={i18n.language}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </label>

      {data && !data.runs && (
        <p className="text-sm text-muted-foreground">{t('class_cards.register.no_class_that_day')}</p>
      )}

      {data && data.runs && (
        <>
          {data.visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('class_cards.register.nobody')}</p>
          ) : (
            <ul className="space-y-2">
              {data.visits.map((v) => (
                <li key={v.visit_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div>
                    <p className="text-sm font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.card_name} · {statusText(v)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(v.status === 'booked' || v.status === 'no_show') && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={act.isPending}
                        onClick={() => act.mutate(() => checkInWithCard(v.card_id, offeringId, date, v.person_id))}
                      >
                        {t('class_cards.register.mark_here')}
                      </Button>
                    )}
                    {(v.status === 'booked' || v.status === 'attended') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() => act.mutate(() => setVisitStatus(v.visit_id, 'no_show'))}
                      >
                        {t('class_cards.register.mark_no_show')}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={act.isPending}
                        onClick={() => act.mutate(() => setVisitStatus(v.visit_id, 'returned'))}
                      >
                        {t('class_cards.register.give_back')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1">
            <label htmlFor={`${id}-walkin`} className="block text-sm font-medium">
              {t('class_cards.register.walk_in')}
            </label>
            {walkInOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('class_cards.register.no_cards')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <select
                  id={`${id}-walkin`}
                  className="rounded border border-border px-3 py-2 text-sm"
                  value={walkInCard}
                  onChange={(e) => setWalkInCard(e.target.value)}
                >
                  <option value="">{t('class_cards.register.choose')}</option>
                  {walkInOptions.map((c) => (
                    <option key={c.card_id} value={c.card_id}>
                      {t('class_cards.register.card_option', { name: c.name, card: c.card_name, left: c.classes_left })}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!walkInCard || act.isPending}
                  onClick={() => act.mutate(() => checkInWithCard(walkInCard, offeringId, date))}
                >
                  {t('class_cards.register.tick_in')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {failed && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {t('class_cards.register.error')}
        </p>
      )}
    </section>
  );
}
