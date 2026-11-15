import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import queryClient from '@/lib/query-client';
import { formatCurrency } from '@shared/format';
import { parseAmountToMinor } from '@/features/finance/components/RecordPaymentModal';
import { clearCashCollected, setCashCollected, type RegisterStudent } from '../service';

function minorToText(minor: number | null | undefined): string {
  if (!minor || minor <= 0) return '';
  return Number.isInteger(minor / 100) ? String(minor / 100) : (minor / 100).toFixed(2);
}

/**
 * "Cash collected" on the register (teachers). The teacher notes that a pupil paid
 * in cash; it is not a payment, and the pupil counts as paid only once the office
 * records it. The amount starts with the class price and can be changed.
 */
export function CashCollected({
  offeringId,
  date,
  student,
  priceMinor,
  currency,
}: {
  offeringId: string;
  date: string;
  student: RegisterStudent;
  priceMinor: number | null | undefined;
  currency: string | null | undefined;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState(() => minorToText(priceMinor));
  const [note, setNote] = useState('');
  const amountMinor = amountText.trim() ? parseAmountToMinor(amountText) : null;
  const amountOk = !amountText.trim() || amountMinor !== null;
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-GB';
  const cash = student.cash ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });
  const save = useMutation({
    mutationFn: () => setCashCollected(offeringId, date, student.person_id, amountMinor, note),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
  });
  const undo = useMutation({
    mutationFn: () => clearCashCollected(offeringId, date, student.person_id),
    onSuccess: refresh,
  });

  if (cash?.status === 'paid') {
    return (
      <p className="w-full text-xs text-muted-foreground" data-testid="cash-paid">
        {t('attendance.cash.paid')}
      </p>
    );
  }

  if (cash?.status === 'waiting') {
    return (
      <p className="w-full text-xs text-muted-foreground" data-testid="cash-waiting">
        {cash.amount_minor
          ? t('attendance.cash.noted_amount', { amount: formatCurrency(cash.amount_minor, currency ?? 'ILS', locale) })
          : t('attendance.cash.noted')}{' '}
        <button
          type="button"
          className="text-primary underline underline-offset-2"
          disabled={undo.isPending}
          onClick={() => undo.mutate()}
        >
          {t('attendance.cash.undo')}
        </button>
        {undo.isError && (
          <span role="alert" className="ms-2 text-destructive">
            {t('attendance.register.error')}
          </span>
        )}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="w-full">
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2"
          data-testid="cash-open"
          aria-label={t('attendance.cash.open_for', { name: student.name })}
          onClick={() => setOpen(true)}
        >
          {t('attendance.cash.open')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md bg-muted/40 p-2" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="text-xs font-medium">
        {t('attendance.cash.title', { name: student.name })}
      </p>
      <p className="text-xs text-muted-foreground">{t('attendance.cash.hint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          {t('attendance.cash.amount', { currency: currency ?? '' })}
          <input
            className="mt-1 block w-28 rounded border border-border px-2 py-1 text-sm"
            inputMode="decimal"
            dir="ltr"
            value={amountText}
            aria-invalid={!amountOk}
            onChange={(e) => setAmountText(e.target.value)}
          />
        </label>
        <label className="min-w-40 flex-1 text-xs">
          {t('attendance.cash.note')}
          <input
            className="mt-1 block w-full rounded border border-border px-2 py-1 text-sm"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button size="sm" variant="primary" disabled={!amountOk || save.isPending} onClick={() => save.mutate()}>
          {t('attendance.cash.save')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t('attendance.cash.cancel')}
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t('attendance.register.error')}
        </p>
      )}
    </div>
  );
}
