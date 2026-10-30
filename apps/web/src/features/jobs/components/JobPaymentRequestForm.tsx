import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { splitDepositBalance, isoDateMinusDays } from '@shared/jobPayments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { JobPaymentRequestInput } from '../services/jobPaymentService';

interface Props {
  currency: string;
  /** Shoot date (YYYY-MM-DD, Asia/Jerusalem) — balance due defaults to it. */
  jobDate: string | null;
  onSubmit: (requests: JobPaymentRequestInput[]) => Promise<unknown>;
  onCancel: () => void;
  isSubmitting: boolean;
}

type Mode = 'single' | 'split';

function toMinor(major: string): number {
  const n = Number(major.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Add requests: one amount, or the quick "deposit X% now + balance due on the
 * shoot date" split. Amounts are entered in shekels and stored in agorot.
 */
export function JobPaymentRequestForm({ currency, jobDate, onSubmit, onCancel, isSubmitting }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('split');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState<string>(jobDate ? isoDateMinusDays(jobDate, 7) : '');
  const [depositPercent, setDepositPercent] = useState('30');
  const [installments, setInstallments] = useState('1');
  const [balanceDue, setBalanceDue] = useState<string>(jobDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const totalMinor = toMinor(amount);
  const percent = Number(depositPercent);
  const split =
    mode === 'split' && Number.isInteger(totalMinor) && totalMinor > 0 && percent > 0 && percent < 100
      ? splitDepositBalance(totalMinor, percent)
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
      setError(t('pages.jobs.payments.form.amountInvalid'));
      return;
    }
    const maxInstallments = Math.min(36, Math.max(1, Number(installments) || 1));
    const requests: JobPaymentRequestInput[] =
      mode === 'single'
        ? [{ label: label || t('pages.jobs.payments.form.defaultLabel'), amount_minor: totalMinor, due_date: dueDate || null, max_installments: maxInstallments }]
        : split
          ? [
              { label: t('pages.jobs.payments.deposit'), amount_minor: split.depositMinor, due_date: dueDate || null, max_installments: 1 },
              ...(split.balanceMinor > 0
                ? [{ label: t('pages.jobs.payments.balance'), amount_minor: split.balanceMinor, due_date: balanceDue || null, max_installments: maxInstallments }]
                : []),
            ]
          : [];
    if (requests.length === 0) {
      setError(t('pages.jobs.payments.form.splitInvalid'));
      return;
    }
    try {
      await onSubmit(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3" aria-label={t('pages.jobs.payments.form.title')}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('pages.jobs.payments.form.mode')}>
        {(['split', 'single'] as const).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? 'primary' : 'outline'} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
            {t(`pages.jobs.payments.form.mode_${m}`)}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="jpr-amount">{t('pages.jobs.payments.form.total', { currency })}</Label>
          <Input id="jpr-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        {mode === 'single' ? (
          <div>
            <Label htmlFor="jpr-label">{t('pages.jobs.payments.form.label')}</Label>
            <Input id="jpr-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('pages.jobs.payments.form.defaultLabel')} />
          </div>
        ) : (
          <div>
            <Label htmlFor="jpr-percent">{t('pages.jobs.payments.form.depositPercent')}</Label>
            <Input id="jpr-percent" type="number" min={1} max={99} dir="ltr" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="jpr-due">{mode === 'split' ? t('pages.jobs.payments.form.depositDue') : t('pages.jobs.payments.form.due')}</Label>
          <Input id="jpr-due" type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {mode === 'split' && (
          <div>
            <Label htmlFor="jpr-balance-due">{t('pages.jobs.payments.form.balanceDue')}</Label>
            <Input id="jpr-balance-due" type="date" dir="ltr" value={balanceDue} onChange={(e) => setBalanceDue(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="jpr-installments">{t('pages.jobs.payments.form.installments')}</Label>
          <Input id="jpr-installments" type="number" min={1} max={36} dir="ltr" value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </div>
      </div>

      {split && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('pages.jobs.payments.form.splitPreview', {
            deposit: (split.depositMinor / 100).toLocaleString(),
            balance: (split.balanceMinor / 100).toLocaleString(),
            currency,
          })}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>{t('pages.jobs.payments.form.save')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
