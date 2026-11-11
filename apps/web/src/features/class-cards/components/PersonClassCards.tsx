import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '@shared/format';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { useManualPaymentMethods } from '@/features/finance/hooks/useManualPaymentMethods';
import { useLastManualMethod } from '@/features/finance/hooks/usePayableItems';
import { NoDocumentConfirmationOption } from '@/features/finance/components/NoDocumentConfirmationOption';
import { parseAmountToMinor } from '@/features/finance/components/RecordPaymentModal';
import type { ManualPaymentMethod } from '@/features/finance/lib/manualPaymentMethods';
import { invalidateAfterOfflinePayment } from '@/features/students/lib/offlinePaymentCaches';
import {
  CardNotGivenError,
  extendClassCard,
  fetchClassCardSettings,
  fetchClassCardTypes,
  fetchPersonClassCards,
  sellClassCardAtStudio,
  type PersonClassCard,
} from '../service';

/**
 * Client page: the person's class cards (classes left, expiry) and "Sell a card" paid at the
 * studio. Shows nothing while the studio has class cards switched off.
 */
export function PersonClassCards({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const tenantId = tenant?.id;
  const [selling, setSelling] = useState(false);

  const settings = useQuery({
    queryKey: ['class-cards', 'settings', tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => fetchClassCardSettings(tenantId!),
  });
  const enabled = settings.data?.enabled === true;
  const cards = useQuery({
    queryKey: ['class-cards', 'person', personId],
    enabled: enabled,
    queryFn: () => fetchPersonClassCards(personId),
  });

  if (!tenant || !enabled) return null;

  return (
    <section className="space-y-2" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="font-semibold text-gray-700">
          {t('class_cards.person.title')}
        </h3>
        {!selling && (
          <Button variant="outline" size="sm" onClick={() => setSelling(true)}>
            {t('class_cards.person.sell')}
          </Button>
        )}
      </div>
      {cards.data && cards.data.length === 0 && !selling && (
        <p className="text-sm text-gray-400">{t('class_cards.person.none')}</p>
      )}
      {cards.data && cards.data.length > 0 && (
        <ul className="space-y-1">
          {cards.data.map((c) => (
            <CardRow key={c.id} card={c} personId={personId} extensionMonths={settings.data?.extension_months ?? 3} />
          ))}
        </ul>
      )}
      {selling && <SellCardForm personId={personId} onDone={() => setSelling(false)} />}
    </section>
  );
}

function CardRow({ card, personId, extensionMonths }: { card: PersonClassCard; personId: string; extensionMonths: number }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';
  const [failed, setFailed] = useState(false);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const expired = card.valid_until != null && card.valid_until < today;
  const asked = Boolean(card.extension_requested_at) && !card.extended_at;
  const canExtend = card.status === 'active' && card.valid_until != null && !card.extended_at;
  const extend = useMutation({
    mutationFn: () => extendClassCard(card.id),
    onMutate: () => setFailed(false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['class-cards', 'person', personId] }),
    onError: () => setFailed(true),
  });
  const parts = [
    t('class_cards.person.left', { left: card.classes_left, total: card.class_count }),
    card.valid_until == null
      ? t('settings.class_cards.never_expires')
      : expired
        ? t('class_cards.person.expired_on', { date: formatDate(card.valid_until, locale) })
        : t('class_cards.person.valid_until', { date: formatDate(card.valid_until, locale) }),
    ...(card.shared ? [t('settings.class_cards.shared')] : []),
    ...(asked ? [t('class_cards.person.asked_for_time')] : []),
    ...(card.extended_at ? [t('class_cards.person.was_extended')] : []),
  ];
  return (
    <li className="space-y-1 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{card.name}</p>
          <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p>
        </div>
        {canExtend && (
          <Button size="sm" variant={asked ? 'primary' : 'ghost'} isLoading={extend.isPending} onClick={() => extend.mutate()}>
            {t('class_cards.person.extend', { count: extensionMonths })}
          </Button>
        )}
      </div>
      {failed && (
        <p role="alert" aria-live="polite" className="text-xs text-destructive">
          {t('class_cards.person.extend_error')}
        </p>
      )}
    </li>
  );
}

function SellCardForm({ personId, onDone }: { personId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const methods = useManualPaymentMethods();
  const lastMethod = useLastManualMethod();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-IL';

  const types = useQuery({
    queryKey: ['class-cards', 'types', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => fetchClassCardTypes(tenant!.id),
  });
  const onSale = (types.data ?? []).filter((c) => c.is_active);

  const [typeChoice, setTypeChoice] = useState<string | null>(null);
  const [amountText, setAmountText] = useState<string | null>(null);
  const [methodChoice, setMethodChoice] = useState<ManualPaymentMethod | null>(null);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Prefill: the first card on sale, its price, and the method used last time.
  const type = onSale.find((c) => c.id === typeChoice) ?? onSale[0] ?? null;
  const shownAmount = amountText ?? (type ? String(type.price_minor / 100) : '');
  const amountMinor = shownAmount.trim() === '0' ? 0 : parseAmountToMinor(shownAmount);
  const method: ManualPaymentMethod =
    methodChoice && methods.includes(methodChoice)
      ? methodChoice
      : lastMethod && methods.includes(lastMethod)
        ? lastMethod
        : 'cash';

  const sell = useMutation({
    mutationFn: () =>
      sellClassCardAtStudio({
        cardTypeId: type!.id,
        cardName: type!.name,
        personId,
        amountMinor: amountMinor ?? 0,
        method,
        sendConfirmation,
        note: t('class_cards.person.payment_note', { name: type!.name }),
        paymentId: pendingPaymentId,
      }),
    onSuccess: async () => {
      invalidateAfterOfflinePayment(queryClient, tenant?.id, personId);
      await queryClient.invalidateQueries({ queryKey: ['class-cards', 'person', personId] });
      onDone();
    },
    onError: (err: Error) => {
      if (err instanceof CardNotGivenError && err.paymentId) {
        setPendingPaymentId(err.paymentId);
        setMessage(t('class_cards.person.paid_not_given'));
      } else {
        setMessage(t('class_cards.person.error'));
      }
    },
  });

  if (!types.data) return null;
  if (onSale.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('class_cards.person.no_cards_on_sale')}</p>;
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <label className="block text-sm">
        {t('class_cards.person.which_card')}
        <select
          className="mt-1 w-full rounded border border-border px-3 py-2"
          value={type?.id ?? ''}
          disabled={pendingPaymentId != null}
          onChange={(e) => {
            setTypeChoice(e.target.value);
            setAmountText(null);
          }}
        >
          {onSale.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {formatCurrency(c.price_minor, c.currency, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        {t('finance.record_payment.amount', { currency: tenant?.currency ?? '' })}
        <input
          className="mt-1 w-full rounded border border-border px-3 py-2"
          inputMode="decimal"
          dir="ltr"
          value={shownAmount}
          disabled={pendingPaymentId != null}
          aria-invalid={amountMinor === null}
          aria-describedby={`${id}-amount-hint`}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <span id={`${id}-amount-hint`} className="mt-1 block text-xs text-muted-foreground">
          {amountMinor === null ? t('finance.record_payment.amount_invalid') : t('class_cards.person.amount_hint')}
        </span>
      </label>

      {amountMinor !== 0 && (
        <label className="block text-sm">
          {t('finance.record_payment.method')}
          <select
            className="mt-1 w-full rounded border border-border px-3 py-2"
            value={method}
            disabled={pendingPaymentId != null}
            onChange={(e) => setMethodChoice(e.target.value as ManualPaymentMethod)}
          >
            <option value="cash">{t('finance.record_payment.cash')}</option>
            <option value="bank_transfer">{t('finance.record_payment.bank')}</option>
            {methods.includes('bit') && <option value="bit">{t('payment_methods.bit')}</option>}
          </select>
        </label>
      )}

      {amountMinor !== 0 && <NoDocumentConfirmationOption checked={sendConfirmation} onChange={setSendConfirmation} />}

      {message && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!type || amountMinor === null}
          isLoading={sell.isPending}
          onClick={() => {
            setMessage(null);
            sell.mutate();
          }}
        >
          {pendingPaymentId ? t('class_cards.person.retry_give') : t('class_cards.person.sell_submit')}
        </Button>
        {!pendingPaymentId && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            {t('settings.class_cards.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
