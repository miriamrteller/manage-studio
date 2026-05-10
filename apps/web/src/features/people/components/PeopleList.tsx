import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePeople } from '../hooks/usePeople';
import { usePersonSearch } from '../hooks/usePersonSearch';
import type { Person } from '@shared/schemas';

interface PeopleListProps {
  onEdit?: (person: Person) => void;
}

export const PeopleList = ({ onEdit }: PeopleListProps) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Use search results if searching, otherwise use paginated list
  const searchResults = usePersonSearch(searchQuery, { enabled: showSearch && searchQuery.trim().length > 0 });
  const peopleList = usePeople({ page, enabled: !showSearch });

  const isSearching = showSearch && searchQuery.trim().length > 0;
  const displayPeople = isSearching ? searchResults.results : peopleList.people;
  const isLoading = isSearching ? searchResults.isSearching : peopleList.isLoading;

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      setShowSearch(false);
      setPage(1);
    } else {
      setShowSearch(true);
    }
  };

  const handleEdit = (person: Person) => {
    if (onEdit) {
      onEdit(person);
    }
  };

  const handleDeleteClick = (personId: string) => {
    setDeleteConfirmId(personId);
  };

  const handleConfirmDelete = async (personId: string) => {
    try {
      await new Promise((resolve, reject) => {
        peopleList.deletePerson(personId, {
          onSuccess: resolve,
          onError: reject,
        });
      });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete person:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4 p-4" dir="rtl">
      {/* Search bar */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('common.search_people')}
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder={t('common.search_by_name_email_phone')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showSearch && searchQuery.trim().length > 0 && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute left-3 top-2.5 text-gray-400 hover:text-gray-600"
              title={t('form.cancel')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-4 text-gray-500">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {(peopleList.error || searchResults.error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {t('common.error')}: {(peopleList.error || searchResults.error)?.message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading &&
        displayPeople.length === 0 &&
        (isSearching ? (
          <div className="text-center py-4 text-gray-500">
            {t('common.no_results_found')}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            {t('common.no_people_yet')}
          </div>
        ))}

      {/* Table */}
      {displayPeople.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.person.name')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.person.email')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">
                  {t('form.person.status')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayPeople.map((person) => (
                <tr key={person.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{person.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {person.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        person.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : person.status === 'inactive'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {t(`form.person.status_${person.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(person)}
                        className="px-3 py-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(person.id)}
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
      {!isSearching && peopleList.total > peopleList.pageSize && (
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
              count: Math.min(peopleList.pageSize, peopleList.total - (page - 1) * peopleList.pageSize),
              total: peopleList.total,
            })}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * peopleList.pageSize >= peopleList.total}
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
              {t('common.delete_person_confirm', {
                name:
                  displayPeople.find((p) => p.id === deleteConfirmId)?.name ||
                  'Person',
              })}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={peopleList.isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                {peopleList.isDeleting ? t('common.loading') : t('common.delete')}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={peopleList.isDeleting}
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
