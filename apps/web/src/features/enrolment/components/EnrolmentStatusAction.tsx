import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  pendingEnrolmentActionLabelKey,
  resolvePendingEnrolmentAction,
} from '../lib/pendingEnrolmentAction';

function EnrolmentStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`pages.portal.enrolment_status.${status}`, status);
  const tone =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'pending_payment' || status === 'pending_waiver'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

interface EnrolmentStatusActionProps {
  status: string;
  engagementId: string;
  size?: 'sm' | 'default';
  returnTo?: string;
}

/**
 * Shows a primary action for pending payment / waiver enrolments; otherwise a status chip.
 */
export function EnrolmentStatusAction({
  status,
  engagementId,
  size = 'sm',
  returnTo,
}: EnrolmentStatusActionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = resolvePendingEnrolmentAction(status, engagementId);

  if (!action) {
    return <EnrolmentStatusBadge status={status} />;
  }

  return (
    <Button
      type="button"
      variant="primary"
      size={size}
      onClick={() =>
        navigate(action.path, returnTo ? { state: { from: returnTo } } : undefined)
      }
    >
      {t(pendingEnrolmentActionLabelKey(action.kind))}
    </Button>
  );
}
