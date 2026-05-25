import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFamilies } from '../hooks/useFamilies';
import type { Family } from '@shared/schemas';

interface FamiliesListProps {
  onEdit?: (family: Family) => void;
}

export const FamiliesList = ({ onEdit }: FamiliesListProps) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const familiesData = useFamilies({ page });

  const handleEdit = (family: Family) => {
    if (onEdit) {
      onEdit(family);
    }
  };

  const handleDeleteClick = (familyId: string) => {
    setDeleteConfirmId(familyId);
  };

  const handleConfirmDelete = async (familyId: string) => {
    try {
      await new Promise((resolve, reject) => {
        familiesData.deleteFamily(familyId, {
          onSuccess: resolve,
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

  return (
    <div className="space-y-4 p-4">
      {/* Loading state */}
      {familiesData.isLoading && (
        <div className="text-center py-4">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {familiesData.error && (
        <div className="alert-error">
          {t('common.error')}: {familiesData.error.message}
        </div>
      )}

      {/* Empty state */}
      {!familiesData.isLoading && familiesData.families.length === 0 && (
        <div className="text-center py-4">
          {t('common.no_families_yet')}
        </div>
      )}

      {/* Table */}
      {familiesData.families.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-right font-medium">
                  {t('form.family.name')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('form.family.contact_person_name')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('form.family.contact_email')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('form.family.contact_phone')}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {familiesData.families.map((family) => (
                <tr key={family.id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border-default)' }}>
                  <td className="px-4 py-3">{family.name}</td>
                  <td className="px-4 py-3">
                    {family.contact_person_name}
                  </td>
                  <td className="px-4 py-3">
                    {family.contact_email}
                  </td>
                  <td className="px-4 py-3">
                    {family.contact_phone}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
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

      {/* Pagination */}
      {familiesData.total > familiesData.pageSize && (
        <div className="flex justify-between items-center pt-4">
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
              count: Math.min(familiesData.pageSize, familiesData.total - (page - 1) * familiesData.pageSize),
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

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'var(--color-surface-overlay)' }}>
          <div className="card max-w-sm mx-4">
            <h3 className="text-lg font-medium mb-4">
              {t('common.confirm_delete')}
            </h3>
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
