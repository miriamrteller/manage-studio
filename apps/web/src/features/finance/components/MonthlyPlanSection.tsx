import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { CardLinkButton } from './CardLinkButton';
import { RecordPaymentModal, formatPeriod, parseAmountToMinor } from './RecordPaymentModal';

export interface MonthlyPlan {
  schedule: {
    id: string;
    amount_minor: number | null;
    amount_note: string | null;
    next_billing_date: string;
    status: string;
  } | null;
  oneOffs: { period: string; amount_minor: number; note: string }[];
}

export const MONTHLY_PLAN_QUERY = 'monthly-plan';

export async function fetchMonthlyPlan(engagementId: string): Promise<MonthlyPlan> {
  const { data: schedule, error } = await supabase
    .from('billing_schedules')
    .select('id, amount_minor, amount_note, next_billing_date, status')
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (error) throw error;
  if (!schedule) return { schedule: null, oneOffs: [] };
  const { data: oneOffs, error: adjError } = await supabase
    .from('billing_month_adjustments')
    .select('period, amount_minor, note')
    .eq('billing_schedule_id', schedule.id)
    .eq('kind', 'one_off')
    .gte('period', String(schedule.next_billing_date).slice(0, 7))
    .order('period', { ascending: true });
  if (adjError) throw adjError;
  return { schedule, oneOffs: oneOffs ?? [] };
}

/** Pure: the amount for a month (one-off, else the student's own, else the class price). */
export function monthAmountFor(plan: MonthlyPlan, period: string, classPriceMinor: number): number {
  const oneOff = plan.oneOffs.find((o) => o.period === period);
  if (oneOff) return oneOff.amount_minor;
  return plan.schedule?.amount_minor ?? classPriceMinor;
}

/** Pure: the next `count` months from the one that is due ("2026-12", "2027-01", …). */
export function comingMonths(dueDate: string, count = 12): string[] {
  const [year, month] = dueDate.slice(0, 7).split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

function minorToText(minor: number | null | undefined): string {
  if (!minor) return '';
  return Number.isInteger(minor / 100) ? String(minor / 100) : (minor / 100).toFixed(2);
}

const ERROR_KEYS = ['note_required', 'amount_must_be_positive', 'period_already_due', 'no_monthly_plan'];

/**
 * Active monthly enrolment (payments follow-up 5): what this student pays each month, and the
 * admin actions on the plan.
 *  - "This student's monthly amount" (instead of the class price), with a reason.
 *  - "A different amount for one month" (a coming month), with a reason.
 *  - Record a monthly payment (defaults to the month's amount) and the card link.
 * Changes go through audited database functions; no pro-rating or discounts.
 */
export function MonthlyPlanSection({
  engagementId,
  classPriceMinor,
  currency,
  paymentProvider,
  onRecorded,
}: {
  engagementId: string;
  classPriceMinor: number;
  currency: string;
  paymentProvider: string | null | undefined;
  onRecorded: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<'student' | 'month' | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const plan = useQuery({
    queryKey: [MONTHLY_PLAN_QUERY, engagementId],
    queryFn: () => fetchMonthlyPlan(engagementId),
  });
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const schedule = plan.data?.schedule ?? null;
  const duePeriod = schedule?.next_billing_date?.slice(0, 7) ?? null;
  const dueAmount = plan.data && duePeriod ? monthAmountFor(plan.data, duePeriod, classPriceMinor) : classPriceMinor;

  const save = useMutation({
    mutationFn: async (input: { kind: 'student' | 'month'; amountMinor: number | null; period?: string; note?: string }) => {
      const { error } =
        input.kind === 'student'
          ? await supabase.rpc('set_billing_schedule_amount', {
              p_engagement_id: engagementId,
              p_amount_minor: input.amountMinor,
              p_note: input.note ?? null,
            })
          : await supabase.rpc('set_billing_month_amount', {
              p_engagement_id: engagementId,
              p_period: input.period,
              p_amount_minor: input.amountMinor,
              p_note: input.note ?? null,
            });
      if (error) {
        const key = ERROR_KEYS.find((k) => error.message.includes(k));
        throw new Error(key ? t(`finance.monthly_plan.error_${key}`) : error.message);
      }
    },
    onSuccess: async () => {
      setEditing(null);
      setMessage(t('finance.monthly_plan.saved'));
      await queryClient.invalidateQueries({ queryKey: [MONTHLY_PLAN_QUERY, engagementId] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const startEdit = (kind: 'student' | 'month') => {
    setEditing(kind);
    setMessage(null);
    setNote(kind === 'student' ? schedule?.amount_note ?? '' : '');
    setAmountText(minorToText(kind === 'student' ? schedule?.amount_minor ?? classPriceMinor : dueAmount));
    if (kind === 'month' && schedule) setPeriod(comingMonths(schedule.next_billing_date)[0]);
  };

  const amountMinor = parseAmountToMinor(amountText);
  const canSave = amountMinor != null && note.trim().length > 0 && (editing !== 'month' || Boolean(period));

  if (recording) {
    return (
      <RecordPaymentModal
        kind="monthly"
        engagementId={engagementId}
        defaultAmountMinor={dueAmount}
        currency={currency}
        onRecorded={() => {
          setRecording(false);
          void queryClient.invalidateQueries({ queryKey: [MONTHLY_PLAN_QUERY, engagementId] });
          onRecorded();
        }}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3" aria-label={t('finance.monthly_plan.title')}>
      {schedule && (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">{t('finance.monthly_plan.monthly_amount')}: </span>
            {schedule.amount_minor != null
              ? `${money(schedule.amount_minor)} · ${t('finance.monthly_plan.student_amount')}`
              : `${money(classPriceMinor)} · ${t('finance.monthly_plan.class_price')}`}
          </p>
          {schedule.amount_minor != null && schedule.amount_note && (
            <p className="text-muted-foreground">{schedule.amount_note}</p>
          )}
          {(plan.data?.oneOffs ?? []).length > 0 && (
            <ul className="space-y-1" aria-label={t('finance.monthly_plan.one_offs')}>
              {plan.data!.oneOffs.map((o) => (
                <li key={o.period} className="flex flex-wrap items-center gap-2">
                  <span>
                    {formatPeriod(o.period, i18n.language)}: {money(o.amount_minor)} · {o.note}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => save.mutate({ kind: 'month', period: o.period, amountMinor: null })}
                  >
                    {t('finance.monthly_plan.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing ? (
        <div className="space-y-2 rounded-lg bg-gray-100 p-3">
          <p className="text-sm font-medium">
            {editing === 'student' ? t('finance.monthly_plan.edit_student') : t('finance.monthly_plan.edit_month')}
          </p>
          {editing === 'month' && schedule && (
            <label className="block text-sm">
              {t('finance.monthly_plan.month')}
              <select className="mt-1 w-full form-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {comingMonths(schedule.next_billing_date).map((p) => (
                  <option key={p} value={p}>
                    {formatPeriod(p, i18n.language)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            {t('finance.record_payment.amount', { currency })}
            <input
              className="mt-1 w-full form-input"
              inputMode="decimal"
              dir="ltr"
              value={amountText}
              aria-invalid={amountMinor == null}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t('finance.monthly_plan.reason')}
            <input className="mt-1 w-full form-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!canSave || save.isPending}
              isLoading={save.isPending}
              onClick={() => save.mutate({ kind: editing, amountMinor, period, note: note.trim() })}
            >
              {t('common.save')}
            </Button>
            {editing === 'student' && schedule?.amount_minor != null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate({ kind: 'student', amountMinor: null })}
              >
                {t('finance.monthly_plan.use_class_price')}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => setRecording(true)}>
            {t('finance.record_payment.monthly_open')}
          </Button>
          {schedule && schedule.status !== 'cancelled' && (
            <>
              <Button variant="outline" size="sm" onClick={() => startEdit('student')}>
                {t('finance.monthly_plan.change_student')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => startEdit('month')}>
                {t('finance.monthly_plan.change_month')}
              </Button>
            </>
          )}
          <CardLinkButton engagementId={engagementId} paymentProvider={paymentProvider} />
        </div>
      )}

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
