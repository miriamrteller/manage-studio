import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="space-y-4 p-4" dir="rtl">
      {/* Loading state */}
      {familiesData.isLoading && (
        <div className="text-center py-4 text-gray-500">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {familiesData.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {t('common.error')}: {familiesData.error.message}
        </div>
      )}

      {/* Empty state */}
      {!familiesData.isLoading && familiesData.families.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          {t('common.no_families_yet')}
        </div>
      )}

      {/* Table */}
      {familiesData.families.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.family.name')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.family.contact_person_name')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.family.contact_email')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.family.contact_phone')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {familiesData.families.map((family) => (
                <tr key={family.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{family.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {family.contact_person_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {family.contact_email}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {family.contact_phone}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(family)}
                        className="px-3 py-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(family.id)}
                        className="px-3 py-1 text-red-600 hover:text-red-800 font-medium text-sm"
                        title={t('common.delete')}
                      >
                        {t('common.delete')}
                      </button>
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
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-gray-600">
            {t('common.page_n', { page })} —{' '}
            {t('common.showing_results', {
              count: Math.min(familiesData.pageSize, familiesData.total - (page - 1) * familiesData.pageSize),
              total: familiesData.total,
            })}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * familiesData.pageSize >= familiesData.total}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {t('common.confirm_delete')}
            </h3>
            <p className="text-gray-600 mb-6">
              {t('common.delete_family_confirm', {
                name:
                  familiesData.families.find((f) => f.id === deleteConfirmId)?.name ||
                  'Family',
              })}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={familiesData.isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                {familiesData.isDeleting ? t('common.loading') : t('common.delete')}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={familiesData.isDeleting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                {t('form.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
