import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLevels } from '../hooks/useLevels';
import type { Level } from '@shared/schemas';

interface LevelsListProps {
  onEdit?: (level: Level) => void;
}

export const LevelsList = ({ onEdit }: LevelsListProps) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const levelsData = useLevels({ page });

  const handleEdit = (level: Level) => {
    if (onEdit) {
      onEdit(level);
    }
  };

  const handleDeleteClick = (levelId: string) => {
    setDeleteConfirmId(levelId);
  };

  const handleConfirmDelete = async (levelId: string) => {
    try {
      levelsData.deleteLevel(levelId, {
        onSuccess: () => {
          setDeleteConfirmId(null);
        },
        onError: (error) => {
          console.error('Failed to delete level:', error);
        },
      });
    } catch (error) {
      console.error('Failed to delete level:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Loading state */}
      {levelsData.isLoading && (
        <div className="text-center py-4">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {levelsData.error && (
        <div className="alert-error">
          {t('common.error')}: {levelsData.error.message}
        </div>
      )}

      {/* Empty state */}
      {!levelsData.isLoading && levelsData.levels.length === 0 && (
        <div className="text-center py-4">
          {t('common.no_levels_yet')}
        </div>
      )}

      {/* Table */}
      {levelsData.levels.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.level.name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.level.sort_order')}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {levelsData.levels.map((level) => (
                <tr key={level.id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border-default)' }}>
                  <td className="px-4 py-3">{level.name}</td>
                  <td className="px-4 py-3 text-center">{level.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-items-center">
                      <button
                        onClick={() => handleEdit(level)}
                        className="button-secondary text-sm"
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(level.id)}
                        className="button-error text-sm"
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
      {levelsData.total > levelsData.pageSize && (
        <div className="flex justify-between items-center pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="button-outline"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm">
            {t('common.page_n', { page })} —{' '}
            {t('common.showing_results', {
              count: Math.min(levelsData.pageSize, levelsData.total - (page - 1) * levelsData.pageSize),
              total: levelsData.total,
            })}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * levelsData.pageSize >= levelsData.total}
            className="button-outline"
          >
            {t('common.next')}
          </button>
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
              {t('common.delete_level_confirm', {
                name:
                  levelsData.levels.find((l) => l.id === deleteConfirmId)?.name ||
                  'Level',
              })}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={levelsData.isDeleting}
                className="flex-1 button-error"
              >
                {levelsData.isDeleting ? t('common.loading') : t('common.delete')}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={levelsData.isDeleting}
                className="flex-1 button-outline"
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
