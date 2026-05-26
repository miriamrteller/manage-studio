import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { FilterMultiSelect, ListSearchInput, SortableHeader, type FilterOption } from '@/components/shared/table';
import { useSortState } from '@/hooks/useSortState';
import { useTerms } from '../hooks/useTerms';
import { DEFAULT_TERM_SORT, type TermSortField } from '../service';
import { TermForm } from './TermForm';
import type { Term } from '@shared/schemas';

export const TermsList = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<FilterOption[]>([]);
  const { sortField, sortOrder, toggleSort } = useSortState<TermSortField>(
    DEFAULT_TERM_SORT.field,
    DEFAULT_TERM_SORT.order
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const termsData = useTerms({
    page,
    searchQuery,
    statuses: selectedStatuses.map((s) => s.value),
    sortField,
    sortOrder,
  });

  const handleSort = (field: TermSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const statusOptions = useMemo(
    () =>
      (['upcoming', 'active', 'completed', 'archived'] as const).map((s) => ({
        value: s,
        label: t(`form.term.status_${s}`),
      })),
    [t]
  );

  const handleFormSubmit = async (data: Partial<Term>) => {
    if (editingTerm?.id) {
      await new Promise<void>((resolve, reject) => {
        termsData.updateTerm(
          { ...editingTerm, ...data } as Term,
          { onSuccess: () => resolve(), onError: reject }
        );
      });
      setEditingTerm(null);
    } else {
      await new Promise<void>((resolve, reject) => {
        termsData.createTerm(data, { onSuccess: () => resolve(), onError: reject });
      });
      setIsCreating(false);
    }
  };

  const handleEdit = (term: Term) => {
    setEditingTerm(term);
  };

  const showFormModal = isCreating || editingTerm !== null;

  const handleDeleteClick = (termId: string) => {
    setDeleteConfirmId(termId);
  };

  const handleConfirmDelete = async (termId: string) => {
    try {
      termsData.deleteTerm(termId, {
        onSuccess: () => {
          setDeleteConfirmId(null);
        },
        onError: (error) => {
          console.error('Failed to delete term:', error);
        },
      });
    } catch (error) {
      console.error('Failed to delete term:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.terms.title')}</h1>
        <p className="text-gray-600">{t('pages.terms.description')}</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end flex-1">
          <div className="flex-1 min-w-48 max-w-md">
            <ListSearchInput
              id="term-search"
              value={searchQuery}
              onChange={(q) => {
                setSearchQuery(q);
                setPage(1);
              }}
              placeholder={t('common.search')}
              isSearching={termsData.isLoading}
            />
          </div>
          <FilterMultiSelect
            id="term-status-filter"
            label={t('form.term.status')}
            selected={selectedStatuses}
            onChange={(next) => {
              setSelectedStatuses(next);
              setPage(1);
            }}
            options={statusOptions}
            className="min-w-48"
          />
        </div>
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          {t('pages.terms.create_button')}
        </Button>
      </div>

      {/* Loading state */}
      {termsData.isLoading && (
        <div className="text-center py-4">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {termsData.error && (
        <div className="alert-error">
          {t('common.error')}: {termsData.error.message}
        </div>
      )}

      {/* Empty state */}
      {!termsData.isLoading && termsData.terms.length === 0 && (
        <EmptyState
          title={t('pages.terms.empty_title')}
          message={t('pages.terms.empty_message')}
          actionLabel={t('pages.terms.create_button')}
          onAction={() => setIsCreating(true)}
        />
      )}

      {/* Table */}
      {termsData.terms.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <SortableHeader
                  label={t('form.term.name')}
                  sortKey="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.term.start_date')}
                  sortKey="start_date"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.term.end_date')}
                  sortKey="end_date"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.term.status')}
                  sortKey="status"
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
              {termsData.terms.map((term) => (
                <tr key={term.id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border-default)' }}>
                  <td className="px-4 py-3">{term.name}</td>
                  <td className="px-4 py-3">{term.start_date}</td>
                  <td className="px-4 py-3">{term.end_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: term.status === 'active'
                          ? 'var(--color-success-light)'
                          : term.status === 'upcoming'
                            ? 'var(--color-info-light)'
                            : 'var(--color-neutral-100)',
                        color: term.status === 'active'
                          ? 'var(--color-success)'
                          : term.status === 'upcoming'
                            ? 'var(--color-info)'
                            : 'var(--color-text-primary)',
                      }}
                    >
                      {t(`form.term.status_${term.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-items-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(term)}
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(term.id)}
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
      {termsData.total > termsData.pageSize && (
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
              count: Math.min(termsData.pageSize, termsData.total - (page - 1) * termsData.pageSize),
              total: termsData.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * termsData.pageSize >= termsData.total}
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
                {editingTerm
                  ? t('pages.terms.edit_title')
                  : t('pages.terms.create_button')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setEditingTerm(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>
            <TermForm
              term={editingTerm || undefined}
              onSubmit={handleFormSubmit}
              isLoading={termsData.isCreating || termsData.isUpdating}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-inline-0 inset-block-0 flex items-center justify-center z-50" style={{ backgroundColor: 'var(--color-surface-overlay)' }}>
          <div className="card max-w-sm mx-4">
            <h3 className="text-lg font-medium mb-4">
              {t('common.confirm_delete')}
            </h3>
            <p className="mb-6">
              {t('common.delete_term_confirm', {
                name:
                  termsData.terms.find((t) => t.id === deleteConfirmId)?.name ||
                  'Term',
              })}
            </p>
            <div className="flex gap-4">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={termsData.isDeleting}
              >
                {termsData.isDeleting ? t('common.loading') : t('common.delete')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelDelete}
                disabled={termsData.isDeleting}
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
