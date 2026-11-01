import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/**
 * Shown instead of a card form when the studio takes payment at the studio
 * (payment_provider = "offline"). The place is reserved as "pending payment";
 * an admin records the payment later (Students → Record offline payment).
 */
export function OfflinePaymentNotice() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2" role="status">
      <h3 className="font-semibold text-foreground">{t('enrolment.offline_payment_title')}</h3>
      <p className="text-sm text-foreground">{t('enrolment.offline_payment_body')}</p>
      <p className="text-sm text-muted-foreground">{t('enrolment.offline_payment_next')}</p>
      <Link to="/dashboard" className="inline-block text-sm font-medium text-primary underline">
        {t('enrolment.offline_payment_portal_link')}
      </Link>
    </div>
  );
}
