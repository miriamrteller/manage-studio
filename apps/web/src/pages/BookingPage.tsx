import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingCalendar } from '@/features/scheduling/components/BookingCalendar';
import { BookingService, type AvailableSlot, type BookableOffering } from '@/features/scheduling/bookingService';
import { useIsNarrowViewport } from '@/features/scheduling/hooks/useIsNarrowViewport';
import { cn } from '@/lib/utils';

function formatWhen(slot: AvailableSlot): string {
  const start = new Date(slot.starts_at);
  const date = start.toLocaleDateString(undefined, {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = start.toLocaleTimeString([], {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

export default function BookingPage() {
  const { t } = useTranslation();
  const { offeringId: offeringParam } = useParams<{ offeringId?: string }>();
  const tenant = useTenant();
  const navigate = useNavigate();
  const isNarrow = useIsNarrowViewport();
  const subdomain = tenant?.subdomain ?? '';
  const detailsRef = useRef<HTMLElement>(null);

  const [selectedOffering, setSelectedOffering] = useState<string | null>(offeringParam ?? null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offeringsQuery = useQuery<BookableOffering[]>({
    queryKey: ['bookableOfferings', subdomain],
    queryFn: () => BookingService.listBookableOfferings(subdomain),
    enabled: !!subdomain,
  });

  const offerings = useMemo(() => offeringsQuery.data ?? [], [offeringsQuery.data]);
  const activeOffering = useMemo(
    () => offerings.find((o) => o.id === selectedOffering) ?? null,
    [offerings, selectedOffering],
  );

  // Always show the calendar under the services: default to the deep-linked
  // offering, otherwise the first bookable service.
  useEffect(() => {
    if (selectedOffering) return;
    if (offerings.length === 0) return;
    const fromParam = offeringParam && offerings.some((o) => o.id === offeringParam)
      ? offeringParam
      : offerings[0].id;
    setSelectedOffering(fromParam);
  }, [offerings, offeringParam, selectedOffering]);

  useEffect(() => {
    setSlot(null);
  }, [selectedOffering]);

  // After picking a slot on a phone, bring the details form into view.
  useEffect(() => {
    if (!slot || !isNarrow || !detailsRef.current) return;
    detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [slot, isNarrow]);

  async function handleSubmit() {
    if (!activeOffering || !slot || !subdomain) return;
    setSubmitting(true);
    setError(null);
    try {
      const hold = await BookingService.createHold({
        subdomain,
        offeringId: activeOffering.id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        clientName: name.trim(),
        clientEmail: email.trim(),
        clientPhone: phone.trim() || null,
      });
      const prepared = await BookingService.prepareCheckout({
        subdomain,
        holdId: hold.hold_id,
        clientName: name.trim(),
        clientEmail: email.trim(),
        clientPhone: phone.trim() || null,
      });
      navigate(prepared.redirect_path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  if (offeringsQuery.isSuccess && offerings.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-2 p-6">
        <h1 className="text-3xl font-bold">{t('scheduling.book.title')}</h1>
        <p className="text-gray-600">{t('scheduling.book.not_enabled')}</p>
      </div>
    );
  }

  const detailsValid = name.trim().length > 0 && email.trim().includes('@');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:space-y-8 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{t('scheduling.book.title')}</h1>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Services (capped + scroll) above calendar — pick service, then see its slots */}
      <section className="space-y-4 sm:space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.choose_service')}</h2>
            {offerings.length > 0 && (
              <p className="text-sm text-gray-500">
                {t('scheduling.book.service_count', { count: offerings.length })}
              </p>
            )}
          </div>
          <ul
            className="grid max-h-[9.5rem] grid-cols-1 gap-2 overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-[var(--color-bg-primary,#fff)] p-2 sm:max-h-[11rem] sm:grid-cols-2 lg:grid-cols-3"
            style={{ scrollbarWidth: 'thin' }}
            aria-label={t('scheduling.book.choose_service')}
          >
            {offerings.map((o) => {
              const selected = selectedOffering === o.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedOffering(o.id)}
                    className={cn(
                      'min-h-11 w-full rounded-md border px-3 py-2.5 text-start transition',
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-secondary)] ring-1 ring-[var(--color-primary)]'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    )}
                  >
                    <div className="font-medium leading-snug">{o.name}</div>
                    <div className="text-xs text-gray-500 sm:text-sm">
                      {o.duration_mins
                        ? t('scheduling.book.duration_mins', { count: o.duration_mins })
                        : ''}
                      {' · '}
                      {(o.price_minor / 100).toLocaleString()} {o.currency}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {selectedOffering && subdomain ? (
          <div className="space-y-2 border-t border-gray-200 pt-4 sm:pt-5">
            <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.choose_slot')}</h2>
            <p className="text-sm text-gray-500">{t('scheduling.book.choose_slot_hint')}</p>
            {activeOffering && (
              <p className="text-sm text-gray-600">
                {t('scheduling.book.availability_for', { service: activeOffering.name })}
              </p>
            )}
            <BookingCalendar
              subdomain={subdomain}
              offeringId={selectedOffering}
              selectedSlot={slot}
              onSelectSlot={setSlot}
            />
          </div>
        ) : (
          offeringsQuery.isLoading && (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          )
        )}
      </section>

      {slot && (
        <section ref={detailsRef} className="mx-auto max-w-xl scroll-mt-4 space-y-3">
          <h2 className="text-base font-semibold sm:text-lg">{t('scheduling.book.your_details')}</h2>
          <p className="text-sm text-gray-600">
            {t('scheduling.book.selected_slot', { when: formatWhen(slot) })}
          </p>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.name')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.email')}</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.phone')}</span>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
            />
          </label>
          <p className="text-sm text-gray-500">{t('scheduling.book.hold_note')}</p>
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            isLoading={submitting}
            disabled={!detailsValid}
            onClick={handleSubmit}
          >
            {t('scheduling.book.continue')}
          </Button>
        </section>
      )}
    </div>
  );
}
