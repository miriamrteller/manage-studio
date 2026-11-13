import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useWorkModes } from '@/hooks/useWorkModes';
import { managePackagesPath } from '@/features/classes/lib/managePackagesPath';

interface QuickActionsRowProps {
  onManageClasses?: () => void;
  onRecordPayment?: () => void;
  onSendNotification?: () => void;
  className?: string;
}

export const QuickActionsRow = ({
  onManageClasses,
  onRecordPayment,
  onSendNotification,
  className = '',
}: QuickActionsRowProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { classes: teachesClasses } = useWorkModes();

  return (
    <div className={className}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('pages.admin.overview.quick_actions')}
      </h3>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={onManageClasses ?? (() => navigate(managePackagesPath(teachesClasses)))}
        >
          {t('pages.admin.overview.manage_classes')}
        </Button>
        <Button
          variant="primary"
          onClick={onRecordPayment ?? (() => navigate('/admin/finance'))}
        >
          {t('pages.admin.overview.record_payment')}
        </Button>
        <Button
          variant="primary"
          onClick={onSendNotification ?? (() => navigate('/admin/notifications'))}
        >
          {t('pages.admin.overview.send_notification')}
        </Button>
      </div>
    </div>
  );
};
