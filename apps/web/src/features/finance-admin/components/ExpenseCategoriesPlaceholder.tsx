import { useTranslation } from 'react-i18next';

export function ExpenseCategoriesPlaceholder() {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-gray-600" role="status">
      {t('finance.categories.coming_soon')}
    </p>
  );
}
