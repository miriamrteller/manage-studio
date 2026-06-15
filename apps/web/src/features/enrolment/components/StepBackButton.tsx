import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface StepBackButtonProps {
  onPrevious: () => void;
  canGoBack?: boolean;
  className?: string;
}

export function StepBackButton({
  onPrevious,
  canGoBack = true,
  className = 'flex-1',
}: StepBackButtonProps) {
  const { t } = useTranslation();

  if (!canGoBack) return null;

  return (
    <Button type="button" onClick={onPrevious} variant="outline" className={className}>
      {t('common.back')}
    </Button>
  );
}
