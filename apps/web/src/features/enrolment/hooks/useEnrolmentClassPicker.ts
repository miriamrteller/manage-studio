import { useCallback, useMemo } from 'react';
import {
  filterClassesByAge,
  buildSeasonStartById,
  isAgeEligible,
  type ClassAgeContext,
} from '../lib/check-requirements';
import {
  isOfferingEnrolled,
  mergeClassesWithEnrolled,
} from '../lib/enrolled-offerings';
import { usePersonExistingEnrolments } from './usePersonExistingEnrolments';

export interface EnrolmentClassPickerClass extends ClassAgeContext {
  id: string;
  name: string;
  season_id?: string | null;
  season_start_date?: string | null;
}

interface UseEnrolmentClassPickerOptions<T extends EnrolmentClassPickerClass> {
  personId?: string;
  personDateOfBirth?: string | null;
  classes: T[];
  terms: Array<{ id: string; start_date?: string | null }>;
  allowAgeOverride?: boolean;
  showAllClasses?: boolean;
}

export function useEnrolmentClassPicker<T extends EnrolmentClassPickerClass>({
  personId,
  personDateOfBirth,
  classes,
  terms,
  allowAgeOverride = false,
  showAllClasses = false,
}: UseEnrolmentClassPickerOptions<T>) {
  const { data: enrolledOfferingKeys, isLoading: enrolledKeysLoading } =
    usePersonExistingEnrolments(personId);

  const seasonStartById = useMemo(() => buildSeasonStartById(terms), [terms]);
  const person = useMemo(() => ({ date_of_birth: personDateOfBirth }), [personDateOfBirth]);
  const ageCheckOptions = useMemo(() => ({ seasonStartById }), [seasonStartById]);

  const { classes: availableClasses, ageFilteringActive } = useMemo(
    () => filterClassesByAge(classes, person, ageCheckOptions),
    [classes, person, ageCheckOptions],
  );

  const displayClasses = useMemo(() => {
    const base = allowAgeOverride && showAllClasses ? classes : availableClasses;
    return mergeClassesWithEnrolled(base, classes, enrolledOfferingKeys);
  }, [allowAgeOverride, showAllClasses, classes, availableClasses, enrolledOfferingKeys]);

  const classSeasonStartDate = useCallback(
    (cls: { season_id?: string | null; season_start_date?: string | null }) => {
      if (cls.season_start_date) return cls.season_start_date;
      if (cls.season_id && seasonStartById[cls.season_id]) return seasonStartById[cls.season_id];
      return null;
    },
    [seasonStartById],
  );

  const getClassAvailability = useCallback(
    (cls: T) => {
      const alreadyEnrolled = isOfferingEnrolled(enrolledOfferingKeys, cls.id, cls.season_id);
      const ageEligible = isAgeEligible(
        {
          min_age: cls.min_age,
          max_age: cls.max_age,
          season_id: cls.season_id ?? null,
          season_start_date: classSeasonStartDate(cls),
        },
        person,
        ageCheckOptions,
      );

      return {
        alreadyEnrolled,
        ageEligible,
        selectable: !alreadyEnrolled,
        eligible: !alreadyEnrolled && ageEligible,
      };
    },
    [ageCheckOptions, classSeasonStartDate, enrolledOfferingKeys, person],
  );

  const isClassAgeEligible = useCallback(
    (cls: T) => getClassAvailability(cls).ageEligible,
    [getClassAvailability],
  );

  const isClassAlreadyEnrolled = useCallback(
    (cls: Pick<T, 'id' | 'season_id'>) =>
      isOfferingEnrolled(enrolledOfferingKeys, cls.id, cls.season_id),
    [enrolledOfferingKeys],
  );

  return {
    displayClasses,
    availableClasses,
    ageFilteringActive,
    enrolledOfferingKeys,
    enrolledKeysLoading,
    seasonStartById,
    ageCheckOptions,
    person,
    classSeasonStartDate,
    getClassAvailability,
    isClassAgeEligible,
    isClassAlreadyEnrolled,
  };
}
