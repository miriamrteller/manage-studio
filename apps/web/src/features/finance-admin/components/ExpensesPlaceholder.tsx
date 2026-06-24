import { useTranslation } from 'react-i18next';

export function ExpensesPlaceholder() {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-gray-600" role="status">
      {t('finance.expenses.coming_soon')}
    </p>
  );
}
