import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTerms } from '../hooks/useTerms';
import type { Term } from '@shared/schemas';

interface TermsListProps {
  onEdit?: (term: Term) => void;
}

export const TermsList = ({ onEdit }: TermsListProps) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const termsData = useTerms({ page });

  const handleEdit = (term: Term) => {
    if (onEdit) {
      onEdit(term);
    }
  };

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
        <div className="text-center py-4">
          {t('common.no_terms_yet')}
        </div>
      )}

      {/* Table */}
      {termsData.terms.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.term.name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.term.start_date')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.term.end_date')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.term.status')}
                </th>
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
