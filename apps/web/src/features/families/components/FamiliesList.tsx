import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useFamilies } from '../hooks/useFamilies';
import { FamilyForm } from './FamilyForm';
import type { Family } from '@shared/schemas';

export const FamiliesList = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const familiesData = useFamilies({ page });

  const handleFormSubmit = async (data: Partial<Family>) => {
    if (editingFamily?.id) {
      await new Promise<void>((resolve, reject) => {
        familiesData.updateFamily(
          { ...editingFamily, ...data } as Family,
          { onSuccess: () => resolve(), onError: reject }
        );
      });
      setEditingFamily(null);
    } else {
      await new Promise<void>((resolve, reject) => {
        familiesData.createFamily(data, { onSuccess: () => resolve(), onError: reject });
      });
      setIsCreating(false);
    }
  };

  const handleEdit = (family: Family) => {
    setEditingFamily(family);
  };

  const handleDeleteClick = (familyId: string) => {
    setDeleteConfirmId(familyId);
  };

  const handleConfirmDelete = async (familyId: string) => {
    try {
      await new Promise<void>((resolve, reject) => {
        familiesData.deleteFamily(familyId, {
          onSuccess: () => resolve(),
          onError: reject,
        });
      });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete family:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const showFormModal = isCreating || editingFamily !== null;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.families.title')}</h1>
        <p className="text-gray-600">{t('pages.families.description')}</p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          {t('pages.families.create_button')}
        </Button>
      </div>

      {familiesData.isLoading && (
        <div className="py-4 text-center">{t('common.loading')}</div>
      )}

      {familiesData.error && (
        <div className="alert-error">
          {t('common.error')}: {familiesData.error.message}
        </div>
      )}

      {!familiesData.isLoading && familiesData.families.length === 0 && (
        <EmptyState
          title={t('pages.families.empty_title')}
          message={t('pages.families.empty_message')}
          actionLabel={t('pages.families.create_button')}
          onAction={() => setIsCreating(true)}
        />
      )}

      {familiesData.families.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_person_name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_email')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_phone')}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {familiesData.families.map((family) => (
                <tr
                  key={family.id}
                  className="border-b hover:bg-opacity-50"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <td className="px-4 py-3">{family.name}</td>
                  <td className="px-4 py-3">{family.contact_person_name}</td>
                  <td className="px-4 py-3">{family.contact_email}</td>
                  <td className="px-4 py-3">{family.contact_phone}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(family)}
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(family.id)}
                        title={t('common.delete')}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {familiesData.total > familiesData.pageSize && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm">
            {t('common.page_n', { page })} —{' '}
            {t('common.showing_results', {
              count: Math.min(
                familiesData.pageSize,
                familiesData.total - (page - 1) * familiesData.pageSize
              ),
              total: familiesData.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * familiesData.pageSize >= familiesData.total}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-xl font-semibold">
                {editingFamily
                  ? t('pages.families.edit_title')
                  : t('pages.families.create_button')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setEditingFamily(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>
            <FamilyForm
              family={editingFamily || undefined}
              onSubmit={handleFormSubmit}
              isLoading={familiesData.isCreating || familiesData.isUpdating}
            />
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-surface-overlay)' }}
        >
          <div className="card mx-4 max-w-sm">
            <h3 className="mb-4 text-lg font-medium">{t('common.confirm_delete')}</h3>
            <p className="mb-6">
              {t('common.delete_family_confirm', {
                name:
                  familiesData.families.find((f) => f.id === deleteConfirmId)?.name ||
                  'Family',
              })}
            </p>
            <div className="flex gap-4">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={familiesData.isDeleting}
              >
                {familiesData.isDeleting ? t('common.loading') : t('common.delete')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelDelete}
                disabled={familiesData.isDeleting}
              >
                {t('form.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
