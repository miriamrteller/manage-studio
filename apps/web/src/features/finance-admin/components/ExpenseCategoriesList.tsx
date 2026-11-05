import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useExpenseCatalog, useExpenseCategories } from '../hooks/useExpenses';
import { expenseCategoryName, expenseLanguage, type ExpenseCatalogItem } from '../lib/expenseCategoryName';

export function ExpenseCategoriesList() {
  const { t, i18n } = useTranslation();
  const lang = expenseLanguage(i18n.language);
  const catalog = useExpenseCatalog();
  const {
    setCatalogEnabled,
    isSwitching,
    switchError,
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
    const editingCatalog = !!categories.find((c) => c.id === editingId)?.catalog_key;
    if (!editingId || (!editingCatalog && !editName.trim())) return;
    updateCategory(
      {
        id: editingId,
        // A common category keeps its catalogue names; only the VAT switch is edited.
        input: editingCatalog
          ? { is_vat_eligible: editVatEligible }
          : { name: editName.trim(), is_vat_eligible: editVatEligible },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const isOn = (key: string) => categories.some((c) => c.catalog_key === key && c.is_active);
  const catalogList = (items: ExpenseCatalogItem[]) => (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const id = `expense-catalog-${item.key}`;
        return (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <input
              id={id}
              type="checkbox"
              role="switch"
              checked={isOn(item.key)}
              disabled={isSwitching || isLoading}
              onChange={(e) => setCatalogEnabled(item, e.target.checked)}
            />
            <label htmlFor={id}>{lang === 'he' ? item.name_he : item.name_en}</label>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('finance.categories.title')}</h1>

      {(catalog.suggested.length > 0 || catalog.more.length > 0) && (
        <section className="card p-4 space-y-4" aria-labelledby="expense-common-title">
          <div className="space-y-1">
            <h2 id="expense-common-title" className="font-semibold">{t('finance.categories.common_title')}</h2>
            <p className="text-sm text-muted-foreground">{t('finance.categories.common_hint')}</p>
          </div>
          {catalog.suggested.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('finance.categories.common_suggested')}</legend>
              {catalogList(catalog.suggested)}
            </fieldset>
          )}
          {catalog.more.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t('finance.categories.common_more')}</summary>
              <div className="mt-2">{catalogList(catalog.more)}</div>
            </details>
          )}
          {switchError && <div className="alert-error text-sm" role="alert">{switchError.message}</div>}
        </section>
      )}

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
                    {editingId === category.id && !category.catalog_key ? (
                      <input
                        className="border rounded px-2 py-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      expenseCategoryName(category, lang)
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
