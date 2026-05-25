import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { usePeople } from '../hooks/usePeople';
import { usePersonSearch } from '../hooks/usePersonSearch';
import { PersonSearch } from './PersonSearch';
import { PersonDetail } from './PersonDetail';
import { PersonForm } from './PersonForm';

export const PeopleList = (): React.ReactNode => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'withdrawn'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Use search results if searching, otherwise use paginated list
  const searchResults = usePersonSearch(searchQuery, { enabled: showSearch && searchQuery.trim().length > 0 });
  const peopleList = usePeople({ page, enabled: !showSearch });

  const isSearching = showSearch && searchQuery.trim().length > 0;
  const displayPeople = (isSearching ? searchResults.results : peopleList.people || []).filter(p =>
    statusFilter === 'all' ? true : p.status === statusFilter
  );
  const isLoading = isSearching ? searchResults.isSearching : peopleList.isLoading;

  return (
    <div className="space-y-4 p-4">
      {/* Page Title */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.people.title')}</h1>
        <p className="text-gray-600">{t('pages.people.description')}</p>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-64">
          <label htmlFor="status-filter" className="block text-sm font-medium mb-1">
            {t('pages.people.filter_by_status')}
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full form-input"
          >
            <option value="all">{t('common.all')}</option>
            <option value="active">{t('pages.people.status_active')}</option>
            <option value="inactive">{t('pages.people.status_inactive')}</option>
            <option value="withdrawn">{t('pages.people.status_withdrawn')}</option>
          </select>
        </div>

        <PersonSearch
          value={searchQuery}
          onChange={(query) => {
            setSearchQuery(query);
            setShowSearch(query.trim().length > 0);
            setPage(1);
          }}
          isSearching={peopleList.isLoading || searchResults.isSearching}
        />

        <Button
          variant="primary"
          onClick={() => setIsCreating(true)}
        >
          {t('pages.people.create_button')}
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-4">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {(peopleList.error || searchResults.error) && (
        <div className="alert-error">
          {t('common.error')}: {(peopleList.error || searchResults.error)?.message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading &&
        displayPeople.length === 0 &&
        (isSearching ? (
          <EmptyState
            title={t('common.no_results_found')}
            message={t('pages.people.search_placeholder')}
          />
        ) : (
          <EmptyState
            title={t('pages.people.empty_title')}
            message={t('pages.people.empty_message')}
            actionLabel={t('pages.people.create_button')}
            onAction={() => setIsCreating(true)}
          />
        ))}

      {/* Table */}
      {displayPeople.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.people.name_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.people.email_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('common.status')}
                </th>
                <th className="ps-4 py-3 text-center font-medium" scope="col">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayPeople.map((person) => (
                <tr key={person.id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border-default)' }}>
                  <td className="px-4 py-3">{person.name}</td>
                  <td className="px-4 py-3">
                    {person.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: person.status === 'active'
                          ? 'var(--color-success-light)'
                          : person.status === 'inactive'
                            ? 'var(--color-warning-light)'
                            : 'var(--color-neutral-100)',
                        color: person.status === 'active'
                          ? 'var(--color-success)'
                          : person.status === 'inactive'
                            ? 'var(--color-warning)'
                            : 'var(--color-text-primary)',
                      }}
                    >
                      {t(`form.person.status_${person.status}`)}
                    </span>
                  </td>
                  <td className="ps-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setSelectedPersonId(person.id)}
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

      {/* Pagination */}
      {!isSearching && peopleList.total > peopleList.pageSize && (
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
              count: Math.min(peopleList.pageSize, peopleList.total - (page - 1) * peopleList.pageSize),
              total: peopleList.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * peopleList.pageSize >= peopleList.total}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      {/* Person Detail Modal */}
      {selectedPersonId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <PersonDetail
              id={selectedPersonId}
              onClose={() => setSelectedPersonId(null)}
            />
          </div>
        </div>
      )}

      {/* Create Person Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">
                {t('pages.people.create_title')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>
            <PersonForm
              onSubmit={async () => {
                setIsCreating(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
