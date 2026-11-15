import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@shared/format';
import { RecordAnyPaymentForm } from '@/features/finance/components/RecordAnyPaymentForm';
import { fetchCashToConfirm, resolveCashNote, type CashNote } from '../services/cashNotesService';

export const CASH_TO_CONFIRM_KEY = ['cash-to-confirm'] as const;

export function useCashToConfirm(enabled = true) {
  return useQuery({ queryKey: CASH_TO_CONFIRM_KEY, queryFn: fetchCashToConfirm, enabled });
}

/** Pure: the note the payment form starts with. */
export function cashPaymentNote(n: Pick<CashNote, 'teacher_name' | 'note'>, collectedBy: string): string {
  return [n.teacher_name ? collectedBy : null, n.note].filter(Boolean).join(' · ');
}

/**
 * Finance → Payments: cash the teachers noted on the register. A note is not a
 * payment: "Mark as paid" records it with everything prefilled (who, class, amount,
 * cash, the class date); "Not received" closes it. Hidden when there is none.
 */
export function CashToConfirm() {
  const { t, i18n } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const notes = useCashToConfirm();
  const [recording, setRecording] = useState<string | null>(null);
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-GB';

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: CASH_TO_CONFIRM_KEY });
    await queryClient.invalidateQueries({ queryKey: ['payments-log'] });
  };
  const resolve = useMutation({
    mutationFn: (v: { id: string; outcome: 'paid' | 'not_received'; paymentId?: string }) =>
      resolveCashNote(v.id, v.outcome, v.paymentId),
    onSuccess: async () => {
      setRecording(null);
      await refresh();
    },
  });

  const list = notes.data ?? [];
  if (list.length === 0) return null;

  const date = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby={`${id}-title`} data-testid="cash-to-confirm">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t('finance.cash_notes.title', { count: list.length })}
      </h2>
      <p className="text-sm text-muted-foreground">{t('finance.cash_notes.description')}</p>
      <ul className="space-y-2">
        {list.map((n) => (
          <li key={n.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">
                  {n.person_name}
                  {n.amount_minor ? ` · ${formatCurrency(n.amount_minor, n.currency ?? 'ILS', locale)}` : ''}
                </p>
                <p className="text-muted-foreground">
                  {t('finance.cash_notes.line', {
                    class: n.class_name,
                    date: date(n.session_date),
                    teacher: n.teacher_name ?? t('finance.cash_notes.a_teacher'),
                  })}
                </p>
                {n.note && <p className="text-muted-foreground">“{n.note}”</p>}
              </div>
              {recording !== n.id && (
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => setRecording(n.id)}>
                    {t('finance.cash_notes.mark_paid')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: n.id, outcome: 'not_received' })}
                  >
                    {t('finance.cash_notes.not_received')}
                  </Button>
                </div>
              )}
            </div>
            {recording === n.id && (
              <>
                <RecordAnyPaymentForm
                  title={t('finance.cash_notes.record_title', { name: n.person_name })}
                  prefill={{
                    person: { id: n.person_id, name: n.person_name },
                    offeringId: n.offering_id,
                    amountMinor: n.amount_minor,
                    method: 'cash',
                    paidOn: n.session_date,
                    note: cashPaymentNote(n, t('finance.cash_notes.collected_by', { teacher: n.teacher_name ?? '' })),
                  }}
                  onRecorded={(paymentId) => resolve.mutate({ id: n.id, outcome: 'paid', paymentId })}
                />
                <Button size="sm" variant="ghost" onClick={() => setRecording(null)}>
                  {t('finance.cash_notes.cancel')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {resolve.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('common.error')}
        </p>
      )}
    </section>
  );
}

/** Dashboard: a line when teachers noted cash that waits for the office. Hidden when none. */
export function CashToConfirmNotice({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const notes = useCashToConfirm();
  const count = notes.data?.length ?? 0;
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3" role="status">
      <p className="text-sm">{t('finance.cash_notes.notice', { count })}</p>
      <Button size="sm" variant="outline" onClick={onOpen}>
        {t('finance.cash_notes.notice_open')}
      </Button>
    </div>
  );
}
