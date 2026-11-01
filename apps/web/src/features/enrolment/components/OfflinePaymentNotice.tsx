import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { clearEnrollmentIntent } from '@/lib/enrollment-intent';
import queryClient from '@/lib/query-client';

/**
 * Shown instead of a card form when the studio takes payment at the studio
 * (payment_provider = "offline"). The place is reserved as "pending payment";
 * an admin records the payment later (Students → Record offline payment).
 * `instructions` is the studio's own text (tenants.offline_payment_instructions).
 */
export function OfflinePaymentNotice({ instructions }: { instructions?: string | null }) {
  const { t } = useTranslation();
  const trimmed = instructions?.trim() || null;

  // The enrolment is finished here (the place is reserved; payment happens at the studio).
  // Clear the stored intent, or /dashboard would send the parent back to /enrol, and refresh
  // the parent portal so the new place shows at once.
  useEffect(() => {
    clearEnrollmentIntent();
    void queryClient.invalidateQueries({ queryKey: ['parent-portal'] });
  }, []);

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2" role="status">
      <h3 className="font-semibold text-foreground">{t('enrolment.offline_payment_title')}</h3>
      <p className="text-sm text-foreground">{t('enrolment.offline_payment_body')}</p>
      {trimmed && (
        <div className="rounded-md bg-background/60 p-3 space-y-1" data-testid="offline-payment-instructions">
          <p className="text-sm font-medium text-foreground">{t('enrolment.offline_payment_how')}</p>
          <p className="text-sm text-foreground whitespace-pre-line">{trimmed}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t('enrolment.offline_payment_next')}</p>
      <Link to="/dashboard" className="inline-block text-sm font-medium text-primary underline">
        {t('enrolment.offline_payment_portal_link')}
      </Link>
    </div>
  );
}
