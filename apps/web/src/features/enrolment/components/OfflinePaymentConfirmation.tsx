import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import type { OfflinePaymentMethod } from '../lib/offlinePaymentService';

export interface OfflinePaymentConfirmationProps {
  method: OfflinePaymentMethod;
  instructions: string | null;
  className?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  billingMode?: string | null;
  billingInterval?: string | null;
  closeLabel: string;
  onClose: () => void;
}

/** Shown after the parent chose to pay at the studio: place reserved, payment pending. */
export function OfflinePaymentConfirmation({
  method,
  instructions,
  className,
  amountMinor,
  currency,
  billingMode,
  billingInterval,
  closeLabel,
  onClose,
}: OfflinePaymentConfirmationProps) {
  const { t, i18n } = useTranslation();
  const trimmedInstructions = instructions?.trim() || null;

  return (
    <div className="max-w-lg mx-auto space-y-4 text-center" data-testid="offline-payment-confirmation">
      <div className="text-5xl" aria-hidden="true">
        ⏳
      </div>
      <h2 className="text-xl font-semibold">{t('enrolment.offline.confirmed_title')}</h2>
      <p className="text-muted-foreground" role="status">
        {t('enrolment.offline.confirmed_desc', {
          method: t(`enrolment.offline.method_${method}`),
        })}
      </p>

      <div className="rounded-lg bg-muted/40 p-4 text-sm text-start space-y-2">
        {className && (
          <p>
            <strong>{t('pages.enrolment.class_label')}:</strong> {className}
          </p>
        )}
        {amountMinor != null && currency && (
          <p>
            <strong>{t('pages.admin_enrol.amount_due')}:</strong>{' '}
            {formatOfferingPrice(t, amountMinor, currency, i18n.language, {
              billing_mode: billingMode ?? null,
              billing_interval: billingInterval ?? null,
            })}
          </p>
        )}
        <p className="font-medium">{t('enrolment.offline.instructions_heading')}</p>
        <p className="whitespace-pre-line">
          {trimmedInstructions ?? t('enrolment.offline.instructions_fallback')}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{t('enrolment.offline.pending_note')}</p>

      <Button type="button" variant="primary" className="w-full" onClick={onClose}>
        {closeLabel}
      </Button>
    </div>
  );
}
