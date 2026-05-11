import { useTranslation } from 'react-i18next';

interface PersonFormMessagesProps {
  submitError: string | null;
  submitSuccess: boolean;
  isCreating: boolean;
}

/**
 * PersonFormMessages: Renders success and error message alerts
 * - Stateless display component
 * - Keep under 150 lines per .instructions.md
 */

export const PersonFormMessages = ({
  submitError,
  submitSuccess,
  isCreating,
}: PersonFormMessagesProps) => {
  const { t } = useTranslation();

  return (
    <>
      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700" role="alert">
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700" role="status">
          {isCreating
            ? t('common.success_created')
            : t('common.success_updated')}
        </div>
      )}
    </>
  );
};
