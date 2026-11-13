import { useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingCalendar } from './BookingCalendar';
import { BookingService, type AvailableSlot } from '../bookingService';
import { formatAppointmentWhen } from '../lib/formatAppointmentWhen';

interface KnownClient {
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * "Book for a client" in the Diary (13 Nov 2026, fewer steps): pick the client, the service
 * and a free time, and it is booked, the same way a client books online (same slot checks,
 * same pay link, the client gets a login). The new booking then shows in the Diary with
 * "Record a payment"; the pay link can be copied and sent.
 */
export function BookForClientPanel({ onBooked }: { onBooked: () => void }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const subdomain = tenant?.subdomain ?? '';
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ when: string; payUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: offerings = [] } = useQuery({
    queryKey: ['bookableOfferings', subdomain],
    queryFn: () => BookingService.listBookableOfferings(subdomain),
    enabled: open && !!subdomain,
  });
  // The only (or first) service is picked already.
  const chosenOffering = offeringId ?? offerings[0]?.id ?? null;

  const { data: clients = [] } = useQuery({
    queryKey: ['book-for-client-people', tenant?.id],
    queryFn: async (): Promise<KnownClient[]> => {
      const { data, error: err } = await supabase
        .from('people')
        .select('name, email, phone')
        .eq('tenant_id', tenant!.id)
        .not('email', 'is', null)
        .order('name');
      if (err) throw err;
      return (data ?? []) as KnownClient[];
    },
    enabled: open && !!tenant?.id,
  });
  const byName = useMemo(() => new Map(clients.map((c) => [c.name.trim().toLowerCase(), c])), [clients]);

  // A known client's email and phone fill in by themselves (still editable).
  const onNameChange = (value: string) => {
    setName(value);
    const known = byName.get(value.trim().toLowerCase());
    if (known) {
      if (known.email) setEmail(known.email);
      if (known.phone) setPhone(known.phone);
    }
  };

  const reset = () => {
    setSlot(null);
    setName('');
    setEmail('');
    setPhone('');
    setError(null);
    setBooked(null);
    setCopied(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosenOffering || !slot || !subdomain) return;
    setSubmitting(true);
    setError(null);
    try {
      const hold = await BookingService.createHold({
        subdomain,
        offeringId: chosenOffering,
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
      setBooked({
        when: formatAppointmentWhen(slot.starts_at, i18n.language),
        payUrl: `${window.location.origin}${prepared.redirect_path}`,
      });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        {t('scheduling.diary.book_for_client')}
      </Button>
    );
  }

  if (booked) {
    return (
      <div className="card space-y-3 border border-green-200 bg-green-50 p-4" role="status">
        <p className="font-medium text-green-900">
          {t('scheduling.diary.booked_for_client', { name: name.trim(), when: booked.when })}
        </p>
        <p className="text-sm text-green-900">{t('scheduling.diary.booked_pay_hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(booked.payUrl).then(() => setCopied(true));
            }}
          >
            {copied ? t('scheduling.diary.pay_link_copied') : t('scheduling.diary.copy_pay_link')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {t('scheduling.diary.book_another')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4" aria-labelledby="book-for-client-heading">
      <h2 id="book-for-client-heading" className="text-lg font-semibold">
        {t('scheduling.diary.book_for_client')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="bfc-name" className="text-sm font-medium">
            {t('scheduling.book.name')}
          </label>
          <Input
            id="bfc-name"
            list={listId}
            required
            autoComplete="off"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <datalist id={listId}>
            {clients.map((c) => (
              <option key={`${c.name}-${c.email}`} value={c.name} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label htmlFor="bfc-email" className="text-sm font-medium">
            {t('scheduling.book.email')}
          </label>
          <Input id="bfc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="bfc-phone" className="text-sm font-medium">
            {t('scheduling.book.phone')}
          </label>
          <Input id="bfc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      {offerings.length > 1 && (
        <div className="space-y-1">
          <label htmlFor="bfc-service" className="text-sm font-medium">
            {t('scheduling.appointments.service')}
          </label>
          <select
            id="bfc-service"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 sm:w-auto"
            value={chosenOffering ?? ''}
            onChange={(e) => {
              setOfferingId(e.target.value);
              setSlot(null);
            }}
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {chosenOffering && subdomain && (
        <BookingCalendar subdomain={subdomain} offeringId={chosenOffering} selectedSlot={slot} onSelectSlot={setSlot} />
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!slot || submitting}>
          {slot
            ? t('scheduling.diary.book_at', { when: formatAppointmentWhen(slot.starts_at, i18n.language) })
            : t('scheduling.diary.pick_a_time')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
