import { useTranslation } from 'react-i18next';

export function PaymentsLogPlaceholder() {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-gray-600" role="status">
      {t('finance.payments.loading')}
    </p>
  );
}
