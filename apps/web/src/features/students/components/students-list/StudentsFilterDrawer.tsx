import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AgeRangeFilter,
  FilterDrawer,
  FilterMultiSelect,
} from '@/components/shared/table';
import { FamilyMultiSelect } from '@/features/families/components/FamilyMultiSelect';
import { getEnrolmentStatusFilterOptions } from '@/features/enrolment/lib/enrolmentFilterOptions';
import type { StudentListFilters, StudentStatusFilter } from '../../hooks/useStudentListFilters';

/** The Students list filter drawer. Photographers only get status filters. */
export function StudentsFilterDrawer({
  open,
  onClose,
  filters,
  isPhotographer,
  hasClasses,
  levels,
  resetPage,
}: {
  open: boolean;
  onClose: () => void;
  filters: StudentListFilters;
  isPhotographer: boolean;
  hasClasses: boolean;
  levels: { id: string; name: string }[];
  resetPage: () => void;
}) {
  const { t } = useTranslation();
  const {
    statusFilter,
    handleStatusFilter,
    selectedEnrolmentStatuses,
    setSelectedEnrolmentStatuses,
    selectedClasses,
    setSelectedClasses,
    selectedLevels,
    setSelectedLevels,
    selectedFamilies,
    setSelectedFamilies,
    minAge,
    setMinAge,
    maxAge,
    setMaxAge,
    classOptions,
    activeFilterCount,
    handleClearAllFilters,
  } = filters;

  const levelOptions = useMemo(
    () => levels.map((l) => ({ value: l.id, label: l.name })),
    [levels]
  );

  const enrolmentStatusOptions = useMemo(() => getEnrolmentStatusFilterOptions(t), [t]);

  return (
    <FilterDrawer
      open={open}
      onClose={onClose}
      title={t('common.filters.title')}
      activeCount={activeFilterCount}
      onClearAll={handleClearAllFilters}
    >
      <div className="space-y-1">
        <span className="block text-sm font-medium">{t('common.status')}</span>
        <div className="flex flex-wrap gap-2">
          {(['active', 'inactive', 'all'] as StudentStatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`pages.students.status_${s}`)}
            </button>
          ))}
        </div>
      </div>

      <FilterMultiSelect
        id="enrolment-status-filter"
        label={t('pages.students.filter_by_enrolment_status')}
        options={enrolmentStatusOptions}
        selected={selectedEnrolmentStatuses}
        onChange={(next) => {
          setSelectedEnrolmentStatuses(next);
          resetPage();
        }}
      />

      {!isPhotographer && hasClasses && (
        <FilterMultiSelect
          id="class-filter"
          label={t('pages.students.filter_by_class')}
          options={classOptions}
          selected={selectedClasses}
          onChange={(next) => {
            setSelectedClasses(next);
            resetPage();
          }}
        />
      )}

      {!isPhotographer && (
        <>
          <FamilyMultiSelect
            selected={selectedFamilies}
            onChange={(next) => {
              setSelectedFamilies(next);
              resetPage();
            }}
          />

          <FilterMultiSelect
            id="level-filter"
            label={t('pages.students.filter_by_level')}
            options={levelOptions}
            selected={selectedLevels}
            onChange={(next) => {
              setSelectedLevels(next);
              resetPage();
            }}
          />

          <AgeRangeFilter
            minAge={minAge}
            maxAge={maxAge}
            onMinChange={(v) => {
              setMinAge(v);
              resetPage();
            }}
            onMaxChange={(v) => {
              setMaxAge(v);
              resetPage();
            }}
            onClear={() => {
              setMinAge(null);
              setMaxAge(null);
              resetPage();
            }}
          />
        </>
      )}
    </FilterDrawer>
  );
}
