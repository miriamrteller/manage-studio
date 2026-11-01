import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import { requestOfflinePayment, type OfflinePaymentMethod } from '../lib/offlinePaymentService';

export interface OfflinePaymentRequested {
  method: OfflinePaymentMethod;
  instructions: string | null;
}

export interface OfflinePaymentPanelProps {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  amountMinor: number | null;
  currency: string | null;
  billingMode?: string | null;
  billingInterval?: string | null;
  /** The studio's own "pay at the studio" text; null when the studio wrote none. */
  instructions: string | null;
  onRequested: (result: OfflinePaymentRequested) => void;
  onPrevious: () => void;
}

const METHODS: readonly OfflinePaymentMethod[] = ['cash', 'bank_transfer'];

/**
 * Public checkout for a studio with no online payment provider: the parent picks how
 * they will pay at the studio and confirms. No card form, nothing is charged.
 */
export function OfflinePaymentPanel({
  classId,
  engagementId,
  enrolmentToken,
  amountMinor,
  currency,
  billingMode,
  billingInterval,
  instructions,
  onRequested,
  onPrevious,
}: OfflinePaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const groupName = useId();
  const [method, setMethod] = useState<OfflinePaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedInstructions = instructions?.trim() || null;

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await requestOfflinePayment({
        engagementId,
        offeringId: classId,
        method,
        enrolmentToken,
      });
      onRequested({
        method,
        instructions: result.offlineInstructions ?? trimmedInstructions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="offline-payment-panel">
      <div className="rounded-lg border border-border p-4 space-y-2">
        <p className="font-semibold">{t('enrolment.offline.title')}</p>
        <p className="text-sm text-muted-foreground">{t('enrolment.offline.desc')}</p>
        {amountMinor != null && currency && (
          <p className="text-sm">
            {t('pages.admin_enrol.amount_due')}:{' '}
            <strong>
              {formatOfferingPrice(t, amountMinor, currency, i18n.language, {
                billing_mode: billingMode ?? null,
                billing_interval: billingInterval ?? null,
              })}
            </strong>
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('enrolment.offline.method_legend')}</legend>
        {METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={groupName}
              value={m}
              checked={method === m}
              onChange={() => setMethod(m)}
              disabled={isSubmitting}
            />
            {t(`enrolment.offline.method_${m}`)}
          </label>
        ))}
      </fieldset>

      <div className="rounded-lg bg-muted/40 px-3 py-3 space-y-1">
        <p className="text-sm font-medium">{t('enrolment.offline.instructions_heading')}</p>
        <p className="text-sm whitespace-pre-line">
          {trimmedInstructions ?? t('enrolment.offline.instructions_fallback')}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{t('enrolment.offline.pending_note')}</p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          onClick={() => void handleConfirm()}
        >
          {t('enrolment.offline.confirm_action')}
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={onPrevious}>
          {t('common.back')}
        </Button>
      </div>
    </div>
  );
}
