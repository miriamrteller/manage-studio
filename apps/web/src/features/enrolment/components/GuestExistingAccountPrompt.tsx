import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface GuestExistingAccountPromptProps {
  onSignIn: () => void;
}

export function GuestExistingAccountPrompt({ onSignIn }: GuestExistingAccountPromptProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <p>{t('pages.enrolment.existing_email_prompt')}</p>
      <Button type="button" variant="outline" size="sm" onClick={onSignIn}>
        {t('pages.enrolment.guest_sign_in_action')}
      </Button>
    </div>
  );
}
