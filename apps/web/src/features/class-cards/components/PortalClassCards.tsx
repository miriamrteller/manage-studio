import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '@shared/format';
import { isSkippedHolidayInIsrael } from '@shared/lib/holidays';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { useClassCardsEnabled } from '../hooks/useClassCardsEnabled';
import {
  askForMoreTime,
  bookWithCard,
  cancelCardBooking,
  classCardErrorCode,
  fetchCardsOnSale,
  fetchMyCardSessions,
  fetchMyClassCards,
  isLateCancel,
  startCardPurchase,
  type CardOnSale,
  type CardSession,
  type MyClassCard,
} from '../service';

const KEY = ['class-cards', 'mine'];

/**
 * Client portal: "Your class cards". Buy a card (paid on the usual pay page), classes left and
 * expiry, book a place in a class the card covers, cancel (the cutoff is shown first, never
 * blocks), and ask once for more time. Renders nothing while the studio has class cards off,
 * or when the person has no cards and none are on sale.
 */
export function PortalClassCards({ myPersonId }: { myPersonId?: string | null }) {
  const { t } = useTranslation();
  const id = useId();
  const tenant = useTenant();
  const enabled = useClassCardsEnabled();
  const cards = useQuery({ queryKey: KEY, queryFn: fetchMyClassCards, enabled });
  const onSale = useQuery({
    queryKey: ['class-cards', 'on-sale', tenant?.id],
    enabled: enabled && Boolean(tenant?.id),
    queryFn: () => fetchCardsOnSale(tenant!.id),
  });

  const mine = cards.data ?? [];
  const forSale = onSale.data ?? [];
  if (!enabled || (mine.length === 0 && forSale.length === 0)) return null;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h3 id={`${id}-title`} className="text-lg font-semibold text-gray-900">
        {t('class_cards.portal.title')}
      </h3>
      {mine.length > 0 && (
        <ul className="space-y-3">
          {mine.map((c) => (
            <CardItem key={c.id} card={c} myPersonId={myPersonId ?? null} />
          ))}
        </ul>
      )}
      {forSale.length > 0 && <BuyCard cards={forSale} />}
    </section>
  );
}

function BuyCard({ cards }: { cards: CardOnSale[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const buy = useMutation({
    mutationFn: (c: CardOnSale) => startCardPurchase(c.id),
    onMutate: () => setMessage(null),
    onSuccess: async ({ payToken }) => {
      if (payToken) {
        navigate(`/pay/${payToken}`);
        return;
      }
      setMessage(t('class_cards.portal.buy_ready'));
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => {
      const code = classCardErrorCode(err);
      setMessage(code === 'needs_enrolment' ? t('class_cards.portal.buy_at_studio') : t('class_cards.portal.error'));
    },
  });

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Button size="sm" variant={open ? 'outline' : 'primary'} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('class_cards.portal.buy')}
      </Button>
      {open && (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('class_cards.portal.classes', { count: c.class_count })}
                  {' · '}
                  {c.valid_months == null
                    ? t('settings.class_cards.never_expires')
                    : t('class_cards.portal.valid_months', { count: c.valid_months })}
                  {c.shareable ? ` · ${t('settings.class_cards.shared')}` : ''}
                </p>
              </div>
              <Button size="sm" variant="primary" disabled={buy.isPending} onClick={() => buy.mutate(c)}>
                {c.price_minor === 0
                  ? t('class_cards.portal.get_free')
                  : t('class_cards.portal.buy_for', { price: formatCurrency(c.price_minor, c.currency, locale) })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

function studioToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function CardItem({ card, myPersonId }: { card: MyClassCard; myPersonId: string | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const expired = card.valid_until != null && card.valid_until < studioToday();
  const usable = card.status === 'active' && !expired && card.classes_left > 0;

  const ask = useMutation({
    mutationFn: () => askForMoreTime(card.id),
    onMutate: () => setFailed(false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: () => setFailed(true),
  });

  if (card.status === 'awaiting_payment') {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
        <div>
          <p className="font-medium">{card.name}</p>
          <p className="text-sm text-muted-foreground">{t('class_cards.portal.waiting_payment')}</p>
        </div>
        {card.pay_token && (
          <Link to={`/pay/${card.pay_token}`} className="text-sm font-medium underline">
            {t('class_cards.portal.pay_now')}
          </Link>
        )}
      </li>
    );
  }

  const canAsk = card.valid_until != null && !card.extension_requested_at && !card.extended_at && card.status === 'active';

  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{card.name}</p>
          <p className="text-sm text-muted-foreground">
            {t('class_cards.person.left', { left: card.classes_left, total: card.class_count })}
            {' · '}
            {card.valid_until == null
              ? t('settings.class_cards.never_expires')
              : expired
                ? t('class_cards.person.expired_on', { date: formatDate(card.valid_until, locale) })
                : t('class_cards.person.valid_until', { date: formatDate(card.valid_until, locale) })}
          </p>
        </div>
        {usable && (
          <Button size="sm" variant={open ? 'outline' : 'primary'} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('class_cards.portal.hide_classes') : t('class_cards.portal.book')}
          </Button>
        )}
      </div>

      {card.extension_requested_at && !card.extended_at && (
        <p className="text-sm text-muted-foreground">{t('class_cards.portal.asked')}</p>
      )}
      {card.extended_at && <p className="text-sm text-muted-foreground">{t('class_cards.portal.extended')}</p>}
      {canAsk && (
        <Button size="sm" variant="ghost" isLoading={ask.isPending} onClick={() => ask.mutate()}>
          {t('class_cards.portal.ask_more_time')}
        </Button>
      )}
      {failed && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {t('class_cards.portal.error')}
        </p>
      )}

      {open && usable && <CardSessions card={card} myPersonId={myPersonId} />}
    </li>
  );
}

function CardSessions({ card, myPersonId }: { card: MyClassCard; myPersonId: string | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sessionsKey = ['class-cards', 'sessions', card.id];
  const sessions = useQuery({ queryKey: sessionsKey, queryFn: () => fetchMyCardSessions(card.id) });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionsKey }),
      queryClient.invalidateQueries({ queryKey: KEY }),
    ]);

  const book = useMutation({
    mutationFn: (s: CardSession) =>
      bookWithCard(card.id, s.offering_id, s.session_date, card.shared && myPersonId ? myPersonId : undefined),
    onMutate: () => setMessage(null),
    onSuccess: refresh,
    onError: (err) => {
      const code = classCardErrorCode(err);
      setMessage(
        code && ['class_full', 'no_classes_left', 'already_booked', 'expired'].includes(code)
          ? t(`class_cards.portal.err_${code}`)
          : t('class_cards.portal.error'),
      );
    },
  });

  const cancel = useMutation({
    mutationFn: (visitId: string) => cancelCardBooking(visitId),
    onMutate: () => setMessage(null),
    onSuccess: async (status) => {
      setConfirmCancel(null);
      setMessage(status === 'late_cancelled' ? t('class_cards.portal.cancelled_late') : t('class_cards.portal.cancelled'));
      await refresh();
    },
    onError: () => setMessage(t('class_cards.portal.error')),
  });

  if (!sessions.data) return null;
  const cutoff = sessions.data.cancel_cutoff_hours;
  // Weekly classes skip Israeli holidays, as on the timetable; a session the studio added is kept.
  const list = sessions.data.sessions.filter((s) => s.is_session || !isSkippedHolidayInIsrael(new Date(s.starts_at)));

  const when = (s: CardSession) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    }).format(new Date(s.starts_at));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('class_cards.portal.cutoff_note', { count: cutoff })}</p>
      {list.length === 0 && <p className="text-sm text-muted-foreground">{t('class_cards.portal.no_sessions')}</p>}
      <ul className="space-y-2">
        {list.map((s) => {
          const key = `${s.offering_id}-${s.session_date}`;
          const booked = s.visit_status === 'booked';
          const late = isLateCancel(s.starts_at, cutoff);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {when(s)}
                  {s.location ? ` · ${s.location}` : ''}
                  {!booked && !s.visit_status ? ` · ${t('class_cards.portal.places_left', { count: s.places_left })}` : ''}
                </p>
              </div>
              {booked ? (
                confirmCancel === s.visit_id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {late && <span className="text-xs">{t('class_cards.portal.late_warning')}</span>}
                    <Button size="sm" variant="destructive" isLoading={cancel.isPending} onClick={() => cancel.mutate(s.visit_id!)}>
                      {t('class_cards.portal.confirm_cancel')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(null)}>
                      {t('class_cards.portal.keep')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{t('class_cards.portal.booked')}</span>
                    <Button size="sm" variant="outline" onClick={() => setConfirmCancel(s.visit_id)}>
                      {t('class_cards.portal.cancel')}
                    </Button>
                  </div>
                )
              ) : s.visit_status ? (
                <span className="text-xs text-muted-foreground">{t(`class_cards.register.status_${s.visit_status === 'attended' ? 'booked' : s.visit_status}`)}</span>
              ) : s.places_left > 0 ? (
                <Button size="sm" variant="primary" disabled={book.isPending} onClick={() => book.mutate(s)}>
                  {t('class_cards.portal.book_place')}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('class_cards.portal.full')}</span>
              )}
            </li>
          );
        })}
      </ul>
      {message && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
