import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PersonSearchCombobox } from '@/components/shared/PersonSearchCombobox';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import type { ManualPaymentMethod } from '../lib/manualPaymentMethods';
import { useManualPaymentMethods } from '../hooks/useManualPaymentMethods';
import { useLastManualMethod, useOpenItems, useStudioOfferings, type PayableItem } from '../hooks/usePayableItems';
import { NoDocumentConfirmationOption } from './NoDocumentConfirmationOption';
import { parseAmountToMinor } from './RecordPaymentModal';

const OTHER = 'other';

/** Pure: today in the admin's own time zone, YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function minorToText(minor: number | null | undefined): string {
  if (!minor || minor <= 0) return '';
  return Number.isInteger(minor / 100) ? String(minor / 100) : (minor / 100).toFixed(2);
}

export type Payer = { personId: string; name: string } | { newName: string; newEmail: string };

/**
 * Pure: which function to call and with what, so the payment lands where recording it from the
 * item itself would put it: a first payment or monthly fee through record-payment with the
 * enrolment, a project payment through record-job-payment, anything else as a standalone payment
 * (an offering the studio sells, or "Other" with a note).
 */
export function recordPaymentRequest(input: {
  payer: Payer;
  item: PayableItem | null;
  amountMinor: number;
  method: ManualPaymentMethod;
  note: string;
  paidOn: string;
  today: string;
  sendConfirmation: boolean;
}): { fn: 'record-payment' | 'record-job-payment'; body: Record<string, unknown> } {
  const shared: Record<string, unknown> = {
    method: input.method,
    ...(input.note.trim() ? { note: input.note.trim() } : {}),
    ...(input.paidOn && input.paidOn !== input.today ? { paid_on: input.paidOn } : {}),
    // Only an untick is sent: the server's default is to confirm.
    ...(input.sendConfirmation ? {} : { send_confirmation: false }),
  };
  const item = input.item;
  if (item?.kind === 'first' || item?.kind === 'monthly') {
    return { fn: 'record-payment', body: { engagement_id: item.engagementId, amount_minor: input.amountMinor, ...shared } };
  }
  if (item?.kind === 'job') {
    return { fn: 'record-job-payment', body: { request_id: item.requestId, amount_minor: input.amountMinor, ...shared } };
  }
  const payer =
    'personId' in input.payer
      ? { person_id: input.payer.personId }
      : {
          new_person: {
            name: input.payer.newName.trim(),
            ...(input.payer.newEmail.trim() ? { email: input.payer.newEmail.trim() } : {}),
          },
        };
  return {
    fn: 'record-payment',
    body: {
      ...payer,
      ...(item?.kind === 'offering' ? { offering_id: item.offeringId } : {}),
      amount_minor: input.amountMinor,
      ...shared,
    },
  };
}

/**
 * Finance -> Payments -> "Record a payment": who paid, what it's for (their open items first,
 * then what the studio sells, then "Other"), amount, method, date and note. Everything known is
 * prefilled (today, the last method used, the item's amount); nothing here blocks, and someone
 * not in the list is added by name.
 */
export function RecordAnyPaymentForm({ onRecorded }: { onRecorded: () => void }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const today = localToday();
  const methods = useManualPaymentMethods();
  const lastMethod = useLastManualMethod();

  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [notInList, setNotInList] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const openItems = useOpenItems(person?.id ?? null);
  const offerings = useStudioOfferings();

  const [itemKey, setItemKey] = useState<string | null>(null);
  const [amountText, setAmountText] = useState<string | null>(null);
  const [methodChoice, setMethodChoice] = useState<ManualPaymentMethod | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const open = openItems.data ?? [];
  const sells = offerings.data ?? [];
  // Prefill: the client's first open item, otherwise "Other".
  const chosenKey = itemKey ?? open[0]?.key ?? OTHER;
  const item = [...open, ...sells].find((i) => i.key === chosenKey) ?? null;
  // Prefilled from the item, always editable (a partial payment, a discount).
  const shownAmount = amountText ?? minorToText(item?.amountMinor);
  const amountMinor = parseAmountToMinor(shownAmount);
  const method: ManualPaymentMethod =
    methodChoice && methods.includes(methodChoice)
      ? methodChoice
      : lastMethod && methods.includes(lastMethod)
        ? lastMethod
        : 'cash';

  const payer: Payer | null = person
    ? { personId: person.id, name: person.name }
    : notInList && newName.trim()
      ? { newName, newEmail }
      : null;
  const ready = payer !== null && amountMinor !== null && !!paidOn && paidOn <= today;

  const itemLabel = (i: PayableItem) =>
    i.kind === 'first'
      ? t('finance.record_payment.any.item_first', { name: i.name })
      : i.kind === 'monthly'
        ? t('finance.record_payment.any.item_monthly', { name: i.name })
        : i.name;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!payer || amountMinor === null) throw new Error(t('common.error'));
      const { fn, body } = recordPaymentRequest({
        payer,
        item: chosenKey === OTHER ? null : item,
        amountMinor,
        method,
        note,
        paidOn,
        today,
        sendConfirmation,
      });
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
    },
    onSuccess: () => {
      setMessage({ kind: 'ok', text: t('finance.record_payment.success') });
      onRecorded();
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });

  const chooseItem = (key: string) => {
    setItemKey(key);
    setAmountText(null); // the new item's amount, until the admin types one
  };

  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t('finance.record_payment.title')}
      </h2>

      <div className="space-y-2">
        {person ? (
          <p className="text-sm">
            <span className="font-medium">{t('finance.record_payment.any.client')}: </span>
            {person.name}{' '}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => {
                setPerson(null);
                setItemKey(null);
                setAmountText(null);
              }}
            >
              {t('finance.record_payment.any.change_client')}
            </button>
          </p>
        ) : notInList ? (
          <div className="space-y-2">
            <label className="block text-sm">
              {t('finance.record_payment.any.new_name')}
              <input
                className="mt-1 w-full rounded border border-border px-3 py-2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              {t('finance.record_payment.any.new_email')}
              <input
                type="email"
                dir="ltr"
                className="mt-1 w-full rounded border border-border px-3 py-2"
                value={newEmail}
                aria-describedby={`${id}-new-email-hint`}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="off"
              />
              <span id={`${id}-new-email-hint`} className="mt-1 block text-xs text-muted-foreground">
                {t('finance.record_payment.any.new_hint')}
              </span>
            </label>
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => setNotInList(false)}
            >
              {t('finance.record_payment.any.search_instead')}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <PersonSearchCombobox
              label={t('finance.record_payment.any.client')}
              placeholder={t('finance.record_payment.any.client_placeholder')}
              onSelect={(p) => {
                setPerson({ id: p.id, name: p.name });
                setItemKey(null);
                setAmountText(null);
              }}
            />
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => setNotInList(true)}
            >
              {t('finance.record_payment.any.not_in_list')}
            </button>
          </div>
        )}
      </div>

      <label className="block text-sm">
        {t('finance.record_payment.any.for')}
        <select
          className="mt-1 w-full rounded border border-border px-3 py-2"
          value={chosenKey}
          onChange={(e) => chooseItem(e.target.value)}
        >
          {open.length > 0 && (
            <optgroup label={t('finance.record_payment.any.open_items')}>
              {open.map((i) => (
                <option key={i.key} value={i.key}>
                  {itemLabel(i)}
                </option>
              ))}
            </optgroup>
          )}
          {sells.length > 0 && (
            <optgroup label={t('finance.record_payment.any.what_you_sell')}>
              {sells.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={OTHER}>{t('finance.record_payment.any.other')}</option>
        </select>
      </label>

      <label className="block text-sm">
        {t('finance.record_payment.amount', { currency: tenant?.currency ?? '' })}
        <input
          className="mt-1 w-full rounded border border-border px-3 py-2"
          inputMode="decimal"
          dir="ltr"
          value={shownAmount}
          aria-invalid={amountMinor === null}
          aria-describedby={`${id}-amount-hint`}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <span id={`${id}-amount-hint`} className="mt-1 block text-xs text-muted-foreground">
          {amountMinor === null
            ? t('finance.record_payment.amount_invalid')
            : t('finance.record_payment.any.amount_hint')}
        </span>
      </label>

      <label className="block text-sm">
        {t('finance.record_payment.method')}
        <select
          className="mt-1 w-full rounded border border-border px-3 py-2"
          value={method}
          onChange={(e) => setMethodChoice(e.target.value as ManualPaymentMethod)}
        >
          <option value="cash">{t('finance.record_payment.cash')}</option>
          <option value="bank_transfer">{t('finance.record_payment.bank')}</option>
          {methods.includes('bit') && <option value="bit">{t('payment_methods.bit')}</option>}
        </select>
      </label>

      <label className="block text-sm">
        {t('finance.record_payment.any.date')}
        <input
          type="date"
          className="mt-1 w-full rounded border border-border px-3 py-2"
          value={paidOn}
          max={today}
          lang={i18n.language}
          onChange={(e) => setPaidOn(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        {chosenKey === OTHER ? t('finance.record_payment.any.what_for') : t('finance.record_payment.note')}
        <input
          className="mt-1 w-full rounded border border-border px-3 py-2"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <NoDocumentConfirmationOption checked={sendConfirmation} onChange={setSendConfirmation} />

      {!payer && (
        <p id={`${id}-need-payer`} className="text-xs text-muted-foreground">
          {t('finance.record_payment.any.need_payer')}
        </p>
      )}
      {message && (
        <p
          className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <Button
        type="button"
        variant="primary"
        disabled={!ready || mutation.isPending}
        isLoading={mutation.isPending}
        aria-describedby={!payer ? `${id}-need-payer` : undefined}
        onClick={() => mutation.mutate()}
      >
        {t('finance.record_payment.submit')}
      </Button>
    </section>
  );
}
