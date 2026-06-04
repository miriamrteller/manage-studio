import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { ListSearchInput, SortableHeader } from '@/components/shared/table';
import { useSortState } from '@/hooks/useSortState';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useFamilies } from '../hooks/useFamilies';
import { DEFAULT_FAMILY_SORT, type AccountSortField } from '../service';
import { useNavigate } from 'react-router-dom';

export const FamiliesList = () => {
  const { t } = useTranslation();
  const { labels } = useEntityLabels();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const { sortField, sortOrder, toggleSort } = useSortState<AccountSortField>(
    DEFAULT_FAMILY_SORT.field,
    DEFAULT_FAMILY_SORT.order
  );

  const familiesData = useFamilies({ page, searchQuery, sortField, sortOrder });

  const handleSort = (field: AccountSortField) => {
    toggleSort(field, () => setPage(1));
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{labels.account.plural}</h1>
        <p className="text-gray-600">{t('pages.families.description')}</p>
      </div>

      <div className="max-w-md">
        <ListSearchInput
          id="family-search"
          value={searchQuery}
          onChange={(q) => {
            setSearchQuery(q);
            setPage(1);
          }}
          placeholder={t('pages.families.search_placeholder')}
          isSearching={familiesData.isLoading}
        />
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
          actionLabel={t('pages.families.enrol_action')}
          onAction={() =>
            navigate('/enrol', { state: { mode: 'admin', from: '/admin/families' } })
          }
        />
      )}

      {familiesData.families.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <SortableHeader
                  label={t('form.family.name')}
                  sortKey="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
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
                  <td className="px-4 py-3">
                    {family.name ?? <span className="italic text-gray-400">{t('pages.families.unnamed')}</span>}
                  </td>
                  <td className="px-4 py-3">{family.contact_person_name ?? '—'}</td>
                  <td className="px-4 py-3">{family.contact_email ?? '—'}</td>
                  <td className="px-4 py-3">{family.contact_phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/admin/families/${family.id}`)}
                        title={t('common.view')}
                      >
                        {t('common.view')}
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
    </div>
  );
};
