import { useTranslation } from 'react-i18next';

export interface JobPaymentsPanelProps {
  engagementId: string;
}

/**
 * Slot for the job's payment requests (deposit, balance) and the payments
 * list. Owned by the shoot_payment_requests / gallery-gating work (migration
 * 20261030000200), which replaces this stub in place — keep the component
 * name and the `engagementId` prop stable.
 */
export function JobPaymentsPanel({ engagementId }: JobPaymentsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="text-sm text-muted-foreground" data-engagement-id={engagementId}>
      {t('pages.jobs.payments_placeholder')}
    </div>
  );
}
