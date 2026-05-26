import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatTime } from '@shared/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { FilterSelect, ListSearchInput, SortableHeader } from '@/components/shared/table';
import { useTenant } from '@/hooks/useTenant';
import { useSortState } from '@/hooks/useSortState';
import { useClasses } from '../hooks/useClasses';
import { useTerms } from '@/features/terms/hooks/useTerms';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTeachers } from '@/features/teachers/hooks/useTeachers';
import { ClassForm } from './ClassForm';
import { ClassRequirementsPanel } from '../requirements/components';
import {
  DEFAULT_CLASS_SORT,
  type ClassSortField,
} from '../utils/sortClasses';
import type { Class } from '@shared/schemas';

export function AdminClassesList() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const [page, setPage] = useState(1);
  const { sortField, sortOrder, toggleSort } = useSortState<ClassSortField>(
    DEFAULT_CLASS_SORT.field,
    DEFAULT_CLASS_SORT.order
  );
  const [filterTermId, setFilterTermId] = useState<string | null>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const classesData = useClasses({
    page,
    publicOnly: false,
    sortField,
    sortOrder,
    termId: filterTermId ?? undefined,
    levelId: filterLevelId ?? undefined,
    status: filterStatus ?? undefined,
    searchQuery,
  });
  const termsData = useTerms({ page: 1 });
  const levelsData = useLevels({ page: 1 });
  const teachersData = useTeachers({ page: 1 });

  const termById = useMemo(
    () => new Map(termsData.terms.map((term) => [term.id, term.name])),
    [termsData.terms]
  );
  const levelById = useMemo(
    () => new Map(levelsData.levels.map((level) => [level.id, level.name])),
    [levelsData.levels]
  );

  const handleFormSubmit = async (data: Partial<Class>) => {
    if (editingClass?.id) {
      await new Promise<void>((resolve, reject) => {
        classesData.updateClass(
          { ...editingClass, ...data } as Class,
          { onSuccess: () => resolve(), onError: reject }
        );
      });
      setEditingClass(null);
    } else {
      await new Promise<void>((resolve, reject) => {
        classesData.createClass(data, { onSuccess: () => resolve(), onError: reject });
      });
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async (classId: string) => {
    try {
      await new Promise<void>((resolve, reject) => {
        classesData.deleteClass(classId, {
          onSuccess: () => resolve(),
          onError: reject,
        });
      });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete class:', error);
    }
  };

  const handleSort = (field: ClassSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const termOptions = useMemo(
    () => termsData.terms.map((term) => ({ value: term.id, label: term.name })),
    [termsData.terms]
  );
  const levelFilterOptions = useMemo(
    () => levelsData.levels.map((level) => ({ value: level.id, label: level.name })),
    [levelsData.levels]
  );
  const statusOptions = useMemo(
    () =>
      (['active', 'cancelled', 'full'] as const).map((s) => ({
        value: s,
        label: t(`form.class.status_${s}`),
      })),
    [t]
  );

  const showFormModal = isCreating || editingClass !== null;
  const currency = tenant?.currency || 'ILS';
  const errorMessage = classesData.error;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.admin_classes.title')}</h1>
        <p className="text-gray-600">{t('pages.admin_classes.description')}</p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          {t('pages.admin_classes.create_button')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <ListSearchInput
            id="class-search"
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            placeholder={t('common.search')}
            isSearching={classesData.isLoading}
          />
        </div>
        <FilterSelect
          id="class-term-filter"
          label={t('form.class.term')}
          value={filterTermId ?? ''}
          onChange={(v) => {
            setFilterTermId(v || null);
            setPage(1);
          }}
          options={termOptions}
          allLabel={t('common.all')}
        />
        <FilterSelect
          id="class-level-filter"
          label={t('form.class.level')}
          value={filterLevelId ?? ''}
          onChange={(v) => {
            setFilterLevelId(v || null);
            setPage(1);
          }}
          options={levelFilterOptions}
          allLabel={t('common.all')}
        />
        <FilterSelect
          id="class-status-filter"
          label={t('common.status')}
          value={filterStatus ?? ''}
          onChange={(v) => {
            setFilterStatus(v || null);
            setPage(1);
          }}
          options={statusOptions}
          allLabel={t('common.all')}
        />
      </div>

      {classesData.isLoading && (
        <div className="py-4 text-center">{t('common.loading')}</div>
      )}

      {errorMessage && (
        <div className="alert-error">
          {t('common.error')}: {errorMessage}
        </div>
      )}

      {!classesData.isLoading && classesData.classes.length === 0 && (
        <EmptyState
          title={t('pages.admin_classes.empty_title')}
          message={t('pages.admin_classes.empty_message')}
          actionLabel={t('pages.admin_classes.create_button')}
          onAction={() => setIsCreating(true)}
        />
      )}

      {classesData.classes.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <SortableHeader
                  label={t('form.class.name')}
                  sortKey="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-start font-medium">{t('form.class.term')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('form.class.level')}</th>
                <SortableHeader
                  label={t('pages.classes.time')}
                  sortKey="schedule"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('pages.classes.capacity')}
                  sortKey="max_capacity"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.class.price')}
                  sortKey="price_minor"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label={t('form.class.status')}
                  sortKey="status"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-center font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {classesData.classes.map((classItem) => (
                <Fragment key={classItem.id}>
                <tr
                  className="border-b hover:bg-opacity-50"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <td className="px-4 py-3">{classItem.name}</td>
                  <td className="px-4 py-3">
                    {termById.get(classItem.term_id) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {classItem.level_id ? levelById.get(classItem.level_id) || '—' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {classItem.day_of_week != null
                      ? `${t(`form.class.day_${classItem.day_of_week}`)}, `
                      : ''}
                    {formatTime(classItem.start_time, i18n.language)} –{' '}
                    {formatTime(classItem.end_time, i18n.language)}
                  </td>
                  <td className="px-4 py-3">{classItem.max_capacity}</td>
                  <td className="px-4 py-3">
                    {formatCurrency(classItem.price_minor, currency, i18n.language)}
                  </td>
                  <td className="px-4 py-3">
                    {t(`form.class.status_${classItem.status}`)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingClass(classItem as Class)}
                        title={t('common.edit')}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExpandedClassId(
                            expandedClassId === classItem.id ? null : classItem.id
                          )
                        }
                        title={t('pages.admin_classes.requirements_button')}
                        aria-expanded={expandedClassId === classItem.id}
                      >
                        {t('pages.admin_classes.requirements_button')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteConfirmId(classItem.id)}
                        title={t('common.delete')}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedClassId === classItem.id && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <ClassRequirementsPanel
                        classId={classItem.id}
                        className={classItem.name}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {classesData.total > classesData.pageSize && (
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
                classesData.pageSize,
                classesData.total - (page - 1) * classesData.pageSize
              ),
              total: classesData.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * classesData.pageSize >= classesData.total}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-xl font-semibold">
                {editingClass
                  ? t('pages.admin_classes.edit_title')
                  : t('pages.admin_classes.create_button')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setEditingClass(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>
            <ClassForm
              classItem={editingClass || undefined}
              terms={termsData.terms}
              levels={levelsData.levels}
              teachers={teachersData.teachers}
              onSubmit={handleFormSubmit}
              isLoading={classesData.isCreating || classesData.isUpdating}
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
              {t('common.delete_class_confirm', {
                name:
                  classesData.classes.find((item) => item.id === deleteConfirmId)?.name ||
                  'Class',
              })}
            </p>
            <div className="flex gap-4">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={classesData.isDeleting}
              >
                {classesData.isDeleting ? t('common.loading') : t('common.delete')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirmId(null)}
                disabled={classesData.isDeleting}
              >
                {t('form.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
