import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Engagement } from '@shared/schemas';
import { StepBackButton } from './StepBackButton';

export interface StepNotificationProps {
  onNext: (data?: Partial<Engagement>) => void;
  onPrevious: () => void;
  onSkip: () => void;
  canGoBack?: boolean;
}

export function StepNotification({
  onNext,
  onPrevious,
  canGoBack = true,
}: StepNotificationProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.notification_desc')}</p>
      <p className="text-sm text-gray-500">{t('pages.enrolment.notification_skip_hint')}</p>

      <Button
        type="button"
        onClick={() => onNext()}
        variant="outline"
        className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition text-center"
      >
        <div className="font-semibold">{t('pages.enrolment.notification_email')}</div>
        <div className="text-sm text-gray-600 mt-1">
          {t('pages.enrolment.notification_email_desc')}
        </div>
      </Button>

      <div className="flex gap-2">
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} />
        <Button
          type="button"
          onClick={() => onNext()}
          variant="primary"
          className={canGoBack ? 'flex-1' : 'w-full'}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
