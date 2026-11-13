import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { useCaptcha } from '@/components/captcha/useCaptcha';
import { useFillWhenEmpty, useSignedInPrefill } from '@/hooks/useSignedInPrefill';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import { errorBodyFrom, refusedAsOwnEmail, refusedAsSpam } from '@/features/crm/components/InquiryForm';
import { BookingService, type BookableOffering } from '../bookingService';
import { busyDaysFrom, daysOfMonth, studioToday, weekdayOf } from '../lib/busyDays';

interface ShootRequestFormProps {
  subdomain: string;
  studioName: string | null;
  offerings: BookableOffering[];
  /** Package from the URL (/book/:offeringId), preselected when it is one of these. */
  initialOfferingId?: string | null;
}

type Status = 'idle' | 'sending' | 'sent' | 'error' | 'spam' | 'own_email' | 'past' | 'captcha';

function formatDay(day: string, language: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(language.startsWith('he') ? 'he-IL' : 'en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Photographer Book page: the client picks a package and a day and sends a
 * request. Nothing is charged. It arrives as a lead (package + day) and the
 * photographer gets an email with a Confirm button; confirming creates the
 * shoot on that day and opens the quote with the pay link. Days the studio's
 * Google Calendar shows as taken are greyed out. No booking rules apply.
 */
export function ShootRequestForm({ subdomain, studioName, offerings, initialOfferingId }: ShootRequestFormProps) {
  const { t, i18n } = useTranslation();
  const captcha = useCaptcha();
  const today = studioToday();
  const [offeringId, setOfferingId] = useState<string>(
    () => (initialOfferingId && offerings.some((o) => o.id === initialOfferingId) ? initialOfferingId : offerings[0]?.id) ?? '',
  );
  useEffect(() => {
    if (!offeringId && offerings[0]) setOfferingId(offerings[0].id);
  }, [offeringId, offerings]);

  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [day, setDay] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [shownAt] = useState(() => Date.now());
  const [status, setStatus] = useState<Status>('idle');
  const known = useSignedInPrefill();
  useFillWhenEmpty(known.name, setName);
  useFillWhenEmpty(known.email, setEmail);
  useFillWhenEmpty(known.phone, setPhone);

  const days = useMemo(() => daysOfMonth(month.year, month.month), [month]);
  const busyQuery = useQuery({
    queryKey: ['shootRequestBusy', subdomain, month.year, month.month],
    // A day either side covers the studio's time zone at the month's edges.
    queryFn: () =>
      BookingService.getCalendarBusy(
        subdomain,
        new Date(Date.parse(`${days[0]}T00:00:00Z`) - 86_400_000).toISOString(),
        new Date(Date.parse(`${days[days.length - 1]}T00:00:00Z`) + 2 * 86_400_000).toISOString(),
      ),
    enabled: !!subdomain,
    staleTime: 5 * 60_000,
  });
  const busy = useMemo(() => busyDaysFrom(busyQuery.data ?? []), [busyQuery.data]);
  const isCurrentMonth = days[0].slice(0, 7) === today.slice(0, 7);

  const locale = i18n.language.startsWith('he') ? 'he-IL' : 'en-GB';
  const monthLabel = new Date(Date.UTC(month.year, month.month - 1, 15)).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  // Sunday-first week, as in Israel.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 1 + i)).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' }),
  );

  function shiftMonth(delta: number) {
    setMonth(({ year, month: m }) => {
      const index = year * 12 + (m - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }

  const detailsValid = name.trim().length > 0 && email.trim().includes('@') && !!offeringId && !!day;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!detailsValid || status === 'sending') return;
    if (!captcha.ready) {
      setStatus('captcha');
      return;
    }
    setStatus('sending');
    try {
      const { data, error } = await supabase.functions.invoke('crm-lead-capture', {
        body: {
          tenantSubdomain: subdomain,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          message: message.trim() || null,
          src: 'website',
          captchaToken: captcha.token,
          shootRequest: { offeringId, date: day },
          website: honeypot || null,
          elapsedMs: Date.now() - shownAt,
        },
      });
      if (error || (data && typeof data === 'object' && 'error' in data)) {
        captcha.reset();
        const body = await errorBodyFrom(error, data);
        const code = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
        setStatus(refusedAsSpam(body) ? 'spam' : refusedAsOwnEmail(body) ? 'own_email' : code === 'date_in_past' ? 'past' : 'error');
        return;
      }
      setStatus('sent');
    } catch {
      captcha.reset();
      setStatus('error');
    }
  }

  if (status === 'sent' && day) {
    const dayText = formatDay(day, i18n.language);
    return (
      <div className="mx-auto max-w-xl space-y-2 p-6 text-center">
        <h1 className="text-2xl font-bold">{t('scheduling.book.request_sent_title')}</h1>
        <p role="status">
          {studioName
            ? t('scheduling.book.request_sent_message', { studio: studioName, day: dayText })
            : t('scheduling.book.request_sent_message_generic', { day: dayText })}
        </p>
      </div>
    );
  }

  const leadingBlanks = weekdayOf(days[0]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('scheduling.book.request_title')}</h1>
        <p className="text-gray-600">
          {studioName
            ? t('scheduling.book.request_intro', { studio: studioName })
            : t('scheduling.book.request_intro_generic')}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6" aria-label={t('scheduling.book.request_title')}>
        <section className="space-y-2">
          <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.request_choose_package')}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={t('scheduling.book.request_choose_package')}>
            {offerings.map((o) => {
              const selected = offeringId === o.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setOfferingId(o.id)}
                    className={cn(
                      'min-h-11 w-full rounded-md border px-3 py-2.5 text-start transition',
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-secondary)] ring-1 ring-[var(--color-primary-ink)]'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    )}
                  >
                    <div className="font-medium leading-snug">{o.name}</div>
                    <div className="text-xs text-gray-500 sm:text-sm">
                      {formatOfferingPrice(t, o.price_minor, o.currency || 'ILS', i18n.language, { billing_mode: 'one_time' })}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.request_choose_day')}</h2>
          <p className="text-sm text-gray-500">{t('scheduling.book.request_day_hint')}</p>
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => shiftMonth(-1)}
                disabled={isCurrentMonth}
                aria-label={t('scheduling.book.request_prev_month')}
              >
                <span aria-hidden="true" className="rtl:rotate-180 inline-block">‹</span>
              </Button>
              <div className="font-medium" aria-live="polite">{monthLabel}</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => shiftMonth(1)}
                aria-label={t('scheduling.book.request_next_month')}
              >
                <span aria-hidden="true" className="rtl:rotate-180 inline-block">›</span>
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label={monthLabel}>
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {days.map((d) => {
                const past = d < today;
                const taken = busy.has(d);
                const selected = day === d;
                const label = formatDay(d, i18n.language);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={past || taken}
                    aria-pressed={selected}
                    aria-label={taken ? `${label}, ${t('scheduling.book.request_day_taken')}` : label}
                    title={taken ? t('scheduling.book.request_day_taken') : undefined}
                    onClick={() => setDay(d)}
                    className={cn(
                      'min-h-10 rounded-md border text-sm transition',
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : past || taken
                          ? 'cursor-not-allowed border-transparent bg-gray-100 text-gray-400'
                          : 'border-gray-200 bg-white hover:border-gray-400',
                      taken && !past && 'line-through',
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
          {day && (
            <p className="text-sm text-gray-700" role="status">
              {t('scheduling.book.request_selected_day', { day: formatDay(day, i18n.language) })}
            </p>
          )}
        </section>

        <section className="mx-auto max-w-xl space-y-3">
          <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.your_details')}</h2>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.name')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.email')}</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.phone')}</span>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.request_message')}</span>
            <textarea
              rows={3}
              className="w-full rounded border px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('scheduling.book.request_message_placeholder')}
            />
          </label>
          {/* Honeypot — off-screen for humans, irresistible to bots. */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="shoot-request-website">Website</label>
            <input
              id="shoot-request-website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {status === 'error' && <div className="alert-error" role="alert">{t('scheduling.book.request_error')}</div>}
          {status === 'past' && <div className="alert-error" role="alert">{t('scheduling.book.request_date_in_past')}</div>}
          {status === 'spam' && <div className="alert-error" role="alert">{t('pages.crm.inquire.spam_error')}</div>}
          {status === 'own_email' && <div className="alert-error" role="alert">{t('pages.crm.inquire.own_email_error')}</div>}
          {status === 'captcha' && !captcha.ready && <div className="alert-error" role="alert">{t('common.captcha_needed')}</div>}

          <PrivacyNotice purpose="enquiry" />
          {captcha.widget}
          <Button
            type="submit"
            variant="primary"
            className="w-full sm:w-auto"
            isLoading={status === 'sending'}
            disabled={!detailsValid}
          >
            {t('scheduling.book.request_send')}
          </Button>
        </section>
      </form>
    </div>
  );
}
