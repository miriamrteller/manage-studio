import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingService, type BookableOffering } from '@/features/scheduling/bookingService';

function todayIso(): string {
  const now = new Date();
  const jm = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return jm; // en-CA → YYYY-MM-DD
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BookingPage() {
  const { t } = useTranslation();
  const { offeringId: offeringParam } = useParams<{ offeringId?: string }>();
  const tenant = useTenant();
  const navigate = useNavigate();
  const subdomain = tenant?.subdomain ?? '';

  const [selectedOffering, setSelectedOffering] = useState<string | null>(offeringParam ?? null);
  const [date, setDate] = useState<string>(todayIso());
  const [slot, setSlot] = useState<{ starts_at: string; ends_at: string } | null>(null);
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

  useEffect(() => {
    setSlot(null);
  }, [selectedOffering, date]);

  const slotsQuery = useQuery({
    queryKey: ['availableSlots', subdomain, selectedOffering, date],
    queryFn: () => BookingService.getAvailableSlots(subdomain, selectedOffering!, date),
    enabled: !!subdomain && !!selectedOffering && !!date,
  });

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
    <div className="mx-auto max-w-xl space-y-8 p-6">
      <header>
        <h1 className="text-3xl font-bold">{t('scheduling.book.title')}</h1>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('scheduling.book.choose_service')}</h2>
        <div className="space-y-2">
          {offerings.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedOffering(o.id)}
              className={`w-full rounded-md border p-3 text-start transition ${
                selectedOffering === o.id
                  ? 'border-primary bg-[var(--color-surface-secondary)]'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">{o.name}</div>
              <div className="text-sm text-gray-500">
                {o.duration_mins ? t('scheduling.book.duration_mins', { count: o.duration_mins }) : ''}
                {' · '}
                {(o.price_minor / 100).toLocaleString()} {o.currency}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedOffering && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('scheduling.book.choose_date')}</h2>
          <Input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </section>
      )}

      {selectedOffering && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('scheduling.book.choose_time')}</h2>
          {slotsQuery.isLoading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : (slotsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">{t('scheduling.book.no_slots')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(slotsQuery.data ?? []).map((s) => (
                <button
                  key={s.starts_at}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`rounded-md border p-2 text-sm transition ${
                    slot?.starts_at === s.starts_at
                      ? 'border-primary bg-[var(--color-surface-secondary)]'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {formatTime(s.starts_at)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {slot && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('scheduling.book.your_details')}</h2>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.name')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.email')}</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('scheduling.book.phone')}</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <p className="text-sm text-gray-500">{t('scheduling.book.hold_note')}</p>
          <Button variant="primary" isLoading={submitting} disabled={!detailsValid} onClick={handleSubmit}>
            {t('scheduling.book.continue')}
          </Button>
        </section>
      )}
    </div>
  );
}
