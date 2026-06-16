import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentStatusAction } from '@/features/enrolment/components/EnrolmentStatusAction';
import {
  CANCELLABLE_PRE_PAYMENT_STATUSES,
  canCancelPrePaymentEnrolment,
  type EngagementStatus,
} from '@/features/enrolment/lib/enrolmentTransitions';
import { isPendingEnrolmentActionStatus } from '@/features/enrolment/lib/pendingEnrolmentAction';
export const ENROLMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'var(--color-success-light)', text: 'var(--color-success)' },
  pending_payment: { bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
  admin_review: { bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
  pending_offer: { bg: 'var(--color-info-light)', text: 'var(--color-info)' },
  waitlisted: { bg: 'var(--color-info-light)', text: 'var(--color-info)' },
  cancelled: { bg: 'var(--color-neutral-100)', text: 'var(--color-text-secondary)' },
  withdrawn: { bg: 'var(--color-neutral-100)', text: 'var(--color-text-secondary)' },
  pending_waiver: { bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
};

export function canShowCancelEnrolment(status: string): boolean {
  if (
    !CANCELLABLE_PRE_PAYMENT_STATUSES.includes(
      status as (typeof CANCELLABLE_PRE_PAYMENT_STATUSES)[number],
    )
  ) {
    return false;
  }
  return canCancelPrePaymentEnrolment({
    status: status as EngagementStatus,
    paymentReceivedAt: null,
    hasSucceededPayment: false,
  }).allowed;
}

interface EnrolmentRowActionsProps {
  className: string;
  status: string;
  engagementId?: string;
  billingLabel?: string | null;
  onCancel?: () => void;
}

export function EnrolmentRowActions({
  className,
  status,
  engagementId,
  billingLabel,
  onCancel,
}: EnrolmentRowActionsProps) {
  const { t } = useTranslation();
  const showCancel = onCancel != null && canShowCancelEnrolment(status);
  const colors = ENROLMENT_STATUS_COLORS[status] ?? ENROLMENT_STATUS_COLORS.cancelled;
  const showCompletionAction = Boolean(engagementId && isPendingEnrolmentActionStatus(status));

  return (
    <li className="py-2 flex justify-between items-center gap-3">
      <span className="font-medium">{className}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {showCompletionAction && engagementId ? (
          <EnrolmentStatusAction status={status} engagementId={engagementId} size="sm" />
        ) : (
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {t(`pages.portal.enrolment_status.${status}`, status.replace('_', ' '))}
          </span>
        )}
        {billingLabel && <span className="text-xs text-gray-500">{billingLabel}</span>}
        {showCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('pages.students.cancel_enrolment_button')}
          </Button>
        )}
      </div>
    </li>
  );
}