import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { enrolmentAgeMismatchMessage } from '@/lib/personAge';
import { formatAgeRange, personAgeAtSeasonStart } from '../lib/check-requirements';
import type { EnrolmentClassPickerClass } from '../hooks/useEnrolmentClassPicker';

export interface ClassAvailabilityState {
  alreadyEnrolled: boolean;
  ageEligible: boolean;
  selectable: boolean;
  eligible: boolean;
}

export interface EnrolmentClassSelectListProps<T extends EnrolmentClassPickerClass> {
  classes: T[];
  selectedClassId: string | null;
  onSelectClass: (cls: T) => void;
  getClassAvailability: (cls: T) => ClassAvailabilityState;
  classSeasonStartDate: (cls: T) => string | null;
  personDateOfBirth?: string | null;
  listClassName?: string;
  ariaLabel?: string;
  renderClassDetails: (cls: T) => ReactNode;
  renderClassMeta?: (cls: T) => ReactNode;
  showAgeMismatchDetail?: boolean;
}

function classOptionClasses(isSelected: boolean, availability: ClassAvailabilityState): string {
  if (isSelected) {
    return 'border-blue-600 bg-blue-50';
  }
  if (availability.alreadyEnrolled) {
    return 'border-green-300 bg-green-50/70 cursor-default';
  }
  if (availability.ageEligible) {
    return 'border-gray-200 hover:border-gray-300 bg-white';
  }
  return 'border-amber-300 hover:border-amber-400 bg-amber-50/40';
}

export function EnrolmentClassSelectList<T extends EnrolmentClassPickerClass>({
  classes,
  selectedClassId,
  onSelectClass,
  getClassAvailability,
  classSeasonStartDate,
  personDateOfBirth,
  listClassName = 'space-y-2',
  ariaLabel,
  renderClassDetails,
  renderClassMeta,
  showAgeMismatchDetail = false,
}: EnrolmentClassSelectListProps<T>) {
  const { t } = useTranslation();

  return (
    <ul className={listClassName} role="listbox" aria-label={ariaLabel}>
      {classes.map((cls) => {
        const isSelected = cls.id === selectedClassId;
        const availability = getClassAvailability(cls);
        const classAges = formatAgeRange(cls.min_age, cls.max_age);
        const classSeasonStart = classSeasonStartDate(cls);
        const classStudentAge =
          personDateOfBirth && classSeasonStart
            ? personAgeAtSeasonStart(personDateOfBirth, classSeasonStart)
            : null;

        return (
          <li key={cls.id}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-disabled={availability.alreadyEnrolled}
              onClick={() => {
                if (!availability.selectable) return;
                onSelectClass(cls);
              }}
              className={[
                'w-full text-start border-2 rounded-lg px-4 py-3 transition-colors',
                classOptionClasses(isSelected, availability),
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">{renderClassDetails(cls)}</div>
                {renderClassMeta?.(cls)}
              </div>
              {!availability.ageEligible && !availability.alreadyEnrolled && (
                <p className="text-xs text-amber-800 mt-1">
                  {showAgeMismatchDetail && classAges && classStudentAge != null
                    ? enrolmentAgeMismatchMessage(classStudentAge, classAges, t)
                    : t('pages.enrolment.ineligible_age')}
                </p>
              )}
              {availability.alreadyEnrolled && (
                <p className="text-xs text-green-800 mt-1">
                  {t('pages.enrolment.already_enrolled_class')}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
