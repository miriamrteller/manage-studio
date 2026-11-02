import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface RecordPaymentModalProps {
  engagementId: string;
  onRecorded: () => void;
  /**
   * 'first': the enrolment's first payment (pending payment). 'monthly': a monthly fee for an
   * active enrolment on a monthly plan; the server records the month that is due.
   */
  kind?: 'first' | 'monthly';
  /** The class price in minor units: the amount field starts with it. */
  defaultAmountMinor?: number | null;
  currency?: string | null;
}

/** Pure: "350" / "350.5" / "350,50" → 35000 / 35050 / 35050; null when not a positive amount. */
export function parseAmountToMinor(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  const minor = Math.round(Number(normalised) * 100);
  return minor > 0 ? minor : null;
}

function minorToText(minor: number): string {
  return Number.isInteger(minor / 100) ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** Pure: "2026-12" → "December 2026" in the admin's language. */
export function formatPeriod(period: string, language: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function RecordPaymentModal({
  engagementId,
  onRecorded,
  kind = 'first',
  defaultAmountMinor,
  currency,
}: RecordPaymentModalProps) {
  const { t, i18n } = useTranslation();
  const monthly = kind === 'monthly';
  const [amountText, setAmountText] = useState(
    defaultAmountMinor && defaultAmountMinor > 0 ? minorToText(defaultAmountMinor) : '',
  );
  const amountMinor = parseAmountToMinor(amountText);
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('record-payment', {
        body: { engagement_id: engagementId, method, note: note || undefined, amount_minor: amountMinor ?? undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      return (data ?? {}) as { period?: string };
    },
    onSuccess: (data) => {
      setMessage(
        monthly && data.period
          ? t('finance.record_payment.monthly_success', { month: formatPeriod(data.period, i18n.language) })
          : t('finance.record_payment.success', { defaultValue: 'Payment recorded.' }),
      );
      onRecorded();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <div className="space-y-3 border border-border rounded-lg p-4">
      <h3 className="font-semibold">
        {monthly
          ? t('finance.record_payment.monthly_title')
          : t('finance.record_payment.title', { defaultValue: 'Record offline payment' })}
      </h3>
      {monthly && <p className="text-sm text-muted-foreground">{t('finance.record_payment.monthly_hint')}</p>}
      <label className="block text-sm">
        {t('finance.record_payment.method', { defaultValue: 'Method' })}
        <select
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'cash' | 'bank_transfer')}
        >
          <option value="cash">{t('finance.record_payment.cash', { defaultValue: 'Cash' })}</option>
          <option value="bank_transfer">{t('finance.record_payment.bank', { defaultValue: 'Bank transfer' })}</option>
        </select>
      </label>
      <label className="block text-sm">
        {t('finance.record_payment.amount', { currency: currency ?? '' })}
        <input
          className="mt-1 w-full border border-border rounded px-3 py-2"
          inputMode="decimal"
          dir="ltr"
          value={amountText}
          aria-invalid={amountMinor == null}
          aria-describedby={`record-payment-amount-hint-${engagementId}`}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <span id={`record-payment-amount-hint-${engagementId}`} className="mt-1 block text-xs text-muted-foreground">
          {amountMinor == null
            ? t('finance.record_payment.amount_invalid')
            : t('finance.record_payment.amount_hint')}
        </span>
      </label>
      <label className="block text-sm">
        {t('finance.record_payment.note', { defaultValue: 'Note (optional)' })}
        <input
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="primary"
        disabled={mutation.isPending || amountMinor == null}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('finance.record_payment.submit', { defaultValue: 'Record payment' })}
      </Button>
    </div>
  );
}
