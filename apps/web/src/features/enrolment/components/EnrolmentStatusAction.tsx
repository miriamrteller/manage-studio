import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { SendAdminWaiverLinkModal } from './SendAdminWaiverLinkModal';
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

export interface EnrolmentLinkContext {
  studentName: string;
  className: string;
  guardianEmail?: string | null;
  guardianName?: string | null;
}

interface EnrolmentStatusActionProps {
  status: string;
  engagementId: string;
  size?: 'sm' | 'md' | 'lg';
  returnTo?: string;
  /** Parent portal navigates to completion pages; admin sends email links for waivers. */
  audience?: 'parent' | 'admin';
  linkContext?: EnrolmentLinkContext;
}

/**
 * Shows a primary action for pending payment / waiver enrolments; otherwise a status chip.
 */
export function EnrolmentStatusAction({
  status,
  engagementId,
  size = 'sm',
  returnTo,
  audience = 'parent',
  linkContext,
}: EnrolmentStatusActionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [waiverModalOpen, setWaiverModalOpen] = useState(false);
  const action = resolvePendingEnrolmentAction(status, engagementId);

  if (!action) {
    return <EnrolmentStatusBadge status={status} />;
  }

  const labelKey =
    audience === 'admin' && action.kind === 'complete_waiver'
      ? 'enrolment.pending_action.send_waiver_link'
      : pendingEnrolmentActionLabelKey(action.kind);

  const handleClick = () => {
    if (audience === 'admin' && action.kind === 'complete_waiver' && tenant && linkContext) {
      setWaiverModalOpen(true);
      return;
    }
    navigate(action.path, returnTo ? { state: { from: returnTo } } : undefined);
  };

  return (
    <>
      <Button type="button" variant="primary" size={size} onClick={handleClick}>
        {t(labelKey)}
      </Button>
      {audience === 'admin' && action.kind === 'complete_waiver' && tenant && linkContext && (
        <SendAdminWaiverLinkModal
          open={waiverModalOpen}
          onClose={() => setWaiverModalOpen(false)}
          tenant={tenant}
          engagementId={engagementId}
          studentName={linkContext.studentName}
          className={linkContext.className}
          guardianEmail={linkContext.guardianEmail}
          guardianName={linkContext.guardianName}
        />
      )}
    </>
  );
}
