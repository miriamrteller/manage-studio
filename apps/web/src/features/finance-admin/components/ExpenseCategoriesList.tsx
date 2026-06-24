import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useExpenseCategories } from '../hooks/useExpenses';

export function ExpenseCategoriesList() {
  const { t } = useTranslation();
  const {
    categories,
    isLoading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    isCreating,
    isUpdating,
    isDeleting,
  } = useExpenseCategories();

  const [name, setName] = useState('');
  const [isVatEligible, setIsVatEligible] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editVatEligible, setEditVatEligible] = useState(true);

  const handleCreate = () => {
    if (!name.trim()) return;
    createCategory(
      { name: name.trim(), is_vat_eligible: isVatEligible, is_active: true, sort_order: 0 },
      {
        onSuccess: () => {
          setName('');
          setIsVatEligible(true);
        },
      },
    );
  };

  const startEdit = (id: string, currentName: string, vatEligible: boolean) => {
    setEditingId(id);
    setEditName(currentName);
    setEditVatEligible(vatEligible);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateCategory(
      {
        id: editingId,
        input: { name: editName.trim(), is_vat_eligible: editVatEligible },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('finance.categories.title')}</h1>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">{t('finance.categories.add')}</h2>
        <input
          className="w-full border rounded px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('finance.categories.name')}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isVatEligible}
            onChange={(e) => setIsVatEligible(e.target.checked)}
          />
          {t('finance.categories.vat_eligible')}
        </label>
        <Button variant="primary" onClick={handleCreate} disabled={isCreating}>
          {t('finance.categories.add')}
        </Button>
      </div>

      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error && <div className="alert-error" role="alert">{error.message}</div>}

      {!isLoading && categories.length === 0 && (
        <EmptyState title={t('finance.categories.empty')} message="" />
      )}

      {categories.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-start">{t('finance.categories.name')}</th>
                <th className="px-3 py-2 text-start">{t('finance.categories.vat_eligible')}</th>
                <th className="px-3 py-2 text-start">{t('finance.categories.active')}</th>
                <th className="px-3 py-2 text-start">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-3 py-2">
                    {editingId === category.id ? (
                      <input
                        className="border rounded px-2 py-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      category.name
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === category.id ? (
                      <input
                        type="checkbox"
                        checked={editVatEligible}
                        onChange={(e) => setEditVatEligible(e.target.checked)}
                      />
                    ) : (
                      category.is_vat_eligible ? t('common.yes') : t('common.no')
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {category.is_active ? t('common.yes') : t('common.no')}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {editingId === category.id ? (
                      <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={isUpdating}>
                        {t('common.save')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(category.id, category.name, category.is_vat_eligible)}
                      >
                        {t('common.edit')}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => deleteCategory(category.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
