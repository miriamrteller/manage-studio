import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useExpenseCategories } from '../hooks/useExpenses';

const CREATE_CATEGORY_VALUE = '__create__';

interface ExpenseCategorySelectProps {
  value: string;
  onChange: (categoryId: string) => void;
  required?: boolean;
}

export function ExpenseCategorySelect({
  value,
  onChange,
  required = true,
}: ExpenseCategorySelectProps) {
  const { t } = useTranslation();
  const { categories, createCategoryAsync, isCreating } = useExpenseCategories();
  const activeCategories = categories.filter((c) => c.is_active);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVatEligible, setNewVatEligible] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCategories.length === 0 && !value) {
      setShowCreate(true);
    }
  }, [activeCategories.length, value]);

  const selectValue = showCreate ? CREATE_CATEGORY_VALUE : value;

  const handleSelectChange = (nextValue: string) => {
    if (nextValue === CREATE_CATEGORY_VALUE) {
      setShowCreate(true);
      setCreateError(null);
      onChange('');
      return;
    }

    setShowCreate(false);
    setCreateError(null);
    onChange(nextValue);
  };

  const handleCreate = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    setCreateError(null);
    try {
      const created = await createCategoryAsync({
        name: trimmedName,
        is_vat_eligible: newVatEligible,
        is_active: true,
        sort_order: 0,
      });
      setNewName('');
      setNewVatEligible(true);
      setShowCreate(false);
      onChange(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const cancelCreate = () => {
    setShowCreate(false);
    setNewName('');
    setNewVatEligible(true);
    setCreateError(null);
    if (value) {
      onChange(value);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('finance.expenses.category')}</span>
        <select
          className="w-full border rounded px-3 py-2"
          value={selectValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          required={required && !showCreate}
        >
          <option value="">{t('common.select')}</option>
          {activeCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          <option value={CREATE_CATEGORY_VALUE}>{t('finance.categories.add_new')}</option>
        </select>
      </label>

      {showCreate && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-sm font-medium">{t('finance.categories.add')}</p>
          <label className="block text-sm">
            <span className="block font-medium mb-1">{t('finance.categories.name')}</span>
            <input
              className="w-full border rounded px-3 py-2 bg-white"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newVatEligible}
              onChange={(e) => setNewVatEligible(e.target.checked)}
            />
            {t('finance.categories.vat_eligible')}
          </label>
          {createError && (
            <div className="alert-error text-sm" role="alert">
              {createError}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isCreating || !newName.trim()}
              isLoading={isCreating}
              onClick={handleCreate}
            >
              {t('finance.categories.add')}
            </Button>
            {activeCategories.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={cancelCreate}>
                {t('form.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
