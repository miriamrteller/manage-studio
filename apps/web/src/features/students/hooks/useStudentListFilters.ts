import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveFilterChip, FilterOption } from '@/components/shared/table';

export type StudentStatusFilter = 'active' | 'inactive' | 'all';

/**
 * Filter state for the Students list: status, class, level, family, enrolment
 * status and age, plus the chips and count shown in the toolbar.
 * Every change sends the list back to page 1 via `resetPage`.
 */
export function useStudentListFilters({
  classes,
  classIdFromUrl,
  resetPage,
}: {
  classes: { id: string; name: string }[];
  classIdFromUrl: string | null;
  resetPage: () => void;
}) {
  const { t } = useTranslation();
  const [selectedEnrolmentStatuses, setSelectedEnrolmentStatuses] = useState<FilterOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>('active');
  const [selectedClasses, setSelectedClasses] = useState<FilterOption[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<FilterOption[]>([]);
  const [selectedFamilies, setSelectedFamilies] = useState<FilterOption[]>([]);
  const [minAge, setMinAge] = useState<number | null>(null);
  const [maxAge, setMaxAge] = useState<number | null>(null);

  const handleStatusFilter = (s: StudentStatusFilter) => {
    setStatusFilter(s);
    resetPage();
  };

  const classOptions = useMemo(
    () => classes.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
    [classes]
  );

  // ?class=<id> preselects that class.
  useEffect(() => {
    if (!classIdFromUrl || classOptions.length === 0) return;
    const match = classOptions.find((option) => option.value === classIdFromUrl);
    if (!match) return;
    setSelectedClasses((prev) =>
      prev.some((option) => option.value === match.value) ? prev : [match]
    );
  }, [classIdFromUrl, classOptions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'active') count++;
    count += selectedClasses.length;
    count += selectedLevels.length;
    count += selectedFamilies.length;
    count += selectedEnrolmentStatuses.length;
    if (minAge != null || maxAge != null) count++;
    return count;
  }, [statusFilter, selectedClasses, selectedLevels, selectedFamilies, selectedEnrolmentStatuses, minAge, maxAge]);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    const chips: ActiveFilterChip[] = [];
    if (statusFilter !== 'active') {
      chips.push({
        key: 'status',
        label: t(`pages.students.status_${statusFilter}`),
        onRemove: () => {
          setStatusFilter('active');
          resetPage();
        },
      });
    }
    for (const cls of selectedClasses) {
      chips.push({
        key: `class-${cls.value}`,
        label: cls.label,
        onRemove: () => {
          setSelectedClasses((prev) => prev.filter((c) => c.value !== cls.value));
          resetPage();
        },
      });
    }
    for (const level of selectedLevels) {
      chips.push({
        key: `level-${level.value}`,
        label: level.label,
        onRemove: () => {
          setSelectedLevels((prev) => prev.filter((l) => l.value !== level.value));
          resetPage();
        },
      });
    }
    for (const family of selectedFamilies) {
      chips.push({
        key: `family-${family.value}`,
        label: family.label,
        onRemove: () => {
          setSelectedFamilies((prev) => prev.filter((f) => f.value !== family.value));
          resetPage();
        },
      });
    }
    for (const enrolmentStatus of selectedEnrolmentStatuses) {
      chips.push({
        key: `enrolment-status-${enrolmentStatus.value}`,
        label: enrolmentStatus.label,
        onRemove: () => {
          setSelectedEnrolmentStatuses((prev) =>
            prev.filter((s) => s.value !== enrolmentStatus.value),
          );
          resetPage();
        },
      });
    }
    if (minAge != null || maxAge != null) {
      const parts = [];
      if (minAge != null) parts.push(`${t('common.filters.age_min')}: ${minAge}`);
      if (maxAge != null) parts.push(`${t('common.filters.age_max')}: ${maxAge}`);
      chips.push({
        key: 'age',
        label: parts.join(' – '),
        onRemove: () => {
          setMinAge(null);
          setMaxAge(null);
          resetPage();
        },
      });
    }
    return chips;
  }, [statusFilter, selectedClasses, selectedLevels, selectedFamilies, selectedEnrolmentStatuses, minAge, maxAge, t, resetPage]);

  const handleClearAllFilters = () => {
    setStatusFilter('active');
    setSelectedClasses([]);
    setSelectedLevels([]);
    setSelectedFamilies([]);
    setSelectedEnrolmentStatuses([]);
    setMinAge(null);
    setMaxAge(null);
    resetPage();
  };

  return {
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
    activeFilterChips,
    handleClearAllFilters,
  };
}

export type StudentListFilters = ReturnType<typeof useStudentListFilters>;
