import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@shared/format';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { FilterMultiSelect, ListSearchInput, SortableHeader, type FilterOption } from '@/components/shared/table';
import { useTenant } from '@/hooks/useTenant';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useSortState } from '@/hooks/useSortState';
import { useClasses } from '../hooks/useClasses';
import { useTerms } from '@/features/terms/hooks/useTerms';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTeachers } from '@/features/teachers/hooks/useTeachers';
import { ClassForm, type ClassFormImageIntent } from './ClassForm';
import { ClassRequirementsPanel } from '../requirements/components';
import {
  DEFAULT_CLASS_SORT,
  type OfferingSortField,
} from '../utils/sortClasses';
import type { Offering } from '@shared/schemas';
import { computeClassTotal } from '@/features/enrolment/lib/computeClassTotal';
import { formatClassAgeRange } from '../lib/formatClassAgeRange';
import { deleteOfferingCover, uploadOfferingCover } from '../lib/offeringImageStorage';

export function AdminClassesList() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { labels } = useEntityLabels();
  const [page, setPage] = useState(1);
  const { sortField, sortOrder, toggleSort } = useSortState<OfferingSortField>(
    DEFAULT_CLASS_SORT.field,
    DEFAULT_CLASS_SORT.order
  );
  const [filterTerms, setFilterTerms] = useState<FilterOption[]>([]);
  const [filterLevels, setFilterLevels] = useState<FilterOption[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<FilterOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<Offering | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const classesData = useClasses({
    page,
    publicOnly: false,
    sortField,
    sortOrder,
    seasonIds: filterTerms.map((t) => t.value),
    categoryIds: filterLevels.map((l) => l.value),
    statuses: filterStatuses.map((s) => s.value),
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

  const handleFormSubmit = async (data: Partial<Offering>, imageIntent: ClassFormImageIntent) => {
    if (!tenant?.id) {
      throw new Error(t('errors.loading_tenant'));
    }

    if (editingClass?.id) {
      const updatedClass = await new Promise<Offering>((resolve, reject) => {
        classesData.updateClass(
          { ...editingClass, ...data } as Offering,
          { onSuccess: resolve, onError: reject }
        );
      });

      if (imageIntent && 'file' in imageIntent) {
        const uploadedPath = await uploadOfferingCover(
          tenant.id,
          updatedClass.id,
          imageIntent.file,
          updatedClass.cover_image_path
        );
        try {
          await classesData.setCoverImagePath(updatedClass.id, uploadedPath);
        } catch (error) {
          await deleteOfferingCover(uploadedPath).catch(() => undefined);
          throw error;
        }
      } else if (
        imageIntent &&
        'remove' in imageIntent &&
        imageIntent.remove &&
        updatedClass.cover_image_path
      ) {
        await deleteOfferingCover(updatedClass.cover_image_path).catch(() => undefined);
        await classesData.setCoverImagePath(updatedClass.id, null);
      }

      setEditingClass(null);
      return;
    }

    const createdClass = await new Promise<Offering>((resolve, reject) => {
      classesData.createClass(data, { onSuccess: resolve, onError: reject });
    });

    if (imageIntent && 'file' in imageIntent) {
      try {
        const uploadedPath = await uploadOfferingCover(
          tenant.id,
          createdClass.id,
          imageIntent.file
        );
        await classesData.setCoverImagePath(createdClass.id, uploadedPath);
      } catch (error) {
        console.error('Class image upload failed:', error);
        throw new Error('errors.image_upload_failed');
      }
    }

    setIsCreating(false);
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

  const handleSort = (field: OfferingSortField) => {
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
        <h1 className="text-3xl font-bold">{t('pages.admin_classes.title', { entity: labels.offering.plural })}</h1>
        <p className="text-gray-600">{t('pages.admin_classes.description', { entity: labels.offering.plural.toLowerCase() })}</p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          {t('pages.admin_classes.create_button', { entity: labels.offering.singular })}
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
        <FilterMultiSelect
          id="class-term-filter"
          label={t('form.class.term')}
          selected={filterTerms}
          onChange={(next) => {
            setFilterTerms(next);
            setPage(1);
          }}
          options={termOptions}
          className="flex-1 min-w-48"
        />
        <FilterMultiSelect
          id="class-level-filter"
          label={t('form.class.level')}
          selected={filterLevels}
          onChange={(next) => {
            setFilterLevels(next);
            setPage(1);
          }}
          options={levelFilterOptions}
          className="flex-1 min-w-48"
        />
        <FilterMultiSelect
          id="class-status-filter"
          label={t('common.status')}
          selected={filterStatuses}
          onChange={(next) => {
            setFilterStatuses(next);
            setPage(1);
          }}
          options={statusOptions}
          className="flex-1 min-w-48"
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
          title={t('pages.admin_classes.empty_title', { entity: labels.offering.plural })}
          message={t('pages.admin_classes.empty_message', { entity: labels.offering.singular.toLowerCase() })}
          actionLabel={t('pages.admin_classes.create_button', { entity: labels.offering.singular })}
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
                <th className="px-4 py-3 text-start font-medium">{t('pages.classes.ages')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('form.class.location')}</th>
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
              {classesData.classes.map((classItem) => {
                const ageRange = formatClassAgeRange(t, classItem.min_age, classItem.max_age);
                return (
                <Fragment key={classItem.id}>
                <tr
                  className="border-b hover:bg-opacity-50"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <td className="px-4 py-3">{classItem.name}</td>
                  <td className="px-4 py-3">
                    {termById.get(classItem.season_id) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {classItem.category_id ? levelById.get(classItem.category_id) || '—' : '—'}
                  </td>
                  <td className="px-4 py-3">{ageRange || '—'}</td>
                  <td className="px-4 py-3">{classItem.location || '—'}</td>
                  <td className="px-4 py-3">
                    {classItem.day_of_week != null
                      ? `${t(`form.class.day_${classItem.day_of_week}`)}, `
                      : ''}
                    {formatTime(classItem.start_time, i18n.language)} –{' '}
                    {formatTime(classItem.end_time, i18n.language)}
                  </td>
                  <td className="px-4 py-3">{classItem.max_capacity}</td>
                  <td className="px-4 py-3">
                    {tenant &&
                      formatOfferingPrice(
                        t,
                        computeClassTotal(classItem, tenant).chargeMinor,
                        currency,
                        i18n.language,
                        classItem,
                      )}
                  </td>
                  <td className="px-4 py-3">
                    {t(`form.class.status_${classItem.status}`)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingClass(classItem as Offering)}
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
                    <td colSpan={10} className="p-0">
                      <ClassRequirementsPanel
                        classId={classItem.id}
                        className={classItem.name}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
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
                  ? t('pages.admin_classes.edit_title', { entity: labels.offering.singular })
                  : t('pages.admin_classes.create_button', { entity: labels.offering.singular })}
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
