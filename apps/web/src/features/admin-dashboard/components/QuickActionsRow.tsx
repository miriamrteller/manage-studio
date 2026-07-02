import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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

  return (
    <div className={className}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('pages.admin.overview.quick_actions')}
      </h3>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={onManageClasses ?? (() => navigate('/admin/setup/classes'))}
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
