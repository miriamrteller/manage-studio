import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { ListSearchInput, SortableHeader } from '@/components/shared/table';
import { useSortState } from '@/hooks/useSortState';
import { useLevels } from '../hooks/useLevels';
import { DEFAULT_LEVEL_SORT, type CategorySortField } from '../service';
import { LevelForm } from './LevelForm';
import type { Category } from '@shared/schemas';

export const LevelsList = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const { sortField, sortOrder, toggleSort } = useSortState<CategorySortField>(
    DEFAULT_LEVEL_SORT.field,
    DEFAULT_LEVEL_SORT.order
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingLevel, setEditingLevel] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const levelsData = useLevels({ page, searchQuery, sortField, sortOrder });

  const handleSort = (field: CategorySortField) => {
    toggleSort(field, () => setPage(1));
  };

  const handleFormSubmit = async (data: Partial<Category>) => {
    if (editingLevel?.id) {
      await new Promise<void>((resolve, reject) => {
        levelsData.updateLevel(
          { ...editingLevel, ...data } as Category,
          { onSuccess: () => resolve(), onError: reject }
        );
      });
      setEditingLevel(null);
    } else {
      await new Promise<void>((resolve, reject) => {
        levelsData.createLevel(data, { onSuccess: () => resolve(), onError: reject });
      });
      setIsCreating(false);
    }
  };

  const handleEdit = (level: Category) => {
    setEditingLevel(level);
  };

  const showFormModal = isCreating || editingLevel !== null;

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
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.levels.title')}</h1>
        <p className="text-gray-600">{t('pages.levels.description')}</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex-1 min-w-48 max-w-md">
          <ListSearchInput
            id="level-search"
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            placeholder={t('common.search')}
            isSearching={levelsData.isLoading}
          />
        </div>
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          {t('pages.levels.create_button')}
        </Button>
      </div>

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
        <EmptyState
          title={t('pages.levels.empty_title')}
          message={t('pages.levels.empty_message')}
          actionLabel={t('pages.levels.create_button')}
          onAction={() => setIsCreating(true)}
        />
      )}

      {/* Table */}
      {levelsData.levels.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <SortableHeader
                  label={t('form.level.name')}
                  sortKey="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.level.sort_order')}
                  sortKey="sort_order"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(level)}
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(level.id)}
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
      {levelsData.total > levelsData.pageSize && (
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
              count: Math.min(levelsData.pageSize, levelsData.total - (page - 1) * levelsData.pageSize),
              total: levelsData.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * levelsData.pageSize >= levelsData.total}
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
                {editingLevel
                  ? t('pages.levels.edit_title')
                  : t('pages.levels.create_button')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setEditingLevel(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>
            <LevelForm
              level={editingLevel || undefined}
              onSubmit={handleFormSubmit}
              isLoading={levelsData.isCreating || levelsData.isUpdating}
            />
          </div>
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
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={levelsData.isDeleting}
              >
                {levelsData.isDeleting ? t('common.loading') : t('common.delete')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelDelete}
                disabled={levelsData.isDeleting}
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
