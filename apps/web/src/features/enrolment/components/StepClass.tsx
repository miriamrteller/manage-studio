import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useRequirements } from '@/features/classes/requirements/hooks/useRequirements';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTerms } from '@/features/terms/hooks/useTerms';
import { useTenant } from '@/hooks/useTenant';
import {
  getRequirementInfoNotes,
  ageAt,
  formatAgeRange,
  personAgeAtSeasonStart,
} from '../lib/check-requirements';
import {
  enrolmentNoClassesAgeHint,
  enrolmentShowingForAgeMessage,
  parseLocalDate,
} from '@/lib/personAge';
import { computeClassTotal } from '../lib/computeClassTotal';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import type { Engagement } from '@shared/schemas';
import type { AgeOverrideState } from '../hooks/useAgeOverride';
import { useEnrolmentClassPicker } from '../hooks/useEnrolmentClassPicker';
import { EnrolmentClassSelectList } from './EnrolmentClassSelectList';
import { AgeOverridePanel } from './AgeOverridePanel';
import { StepBackButton } from './StepBackButton';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

export interface StepClassProps {
  data: Partial<Engagement>;
  personDateOfBirth?: string | null;
  initialTermId?: string;
  allowAgeOverride?: boolean;
  ageOverride: AgeOverrideState;
  onAgeOverrideChange: (confirmed: boolean, reason: string) => void;
  onNext: (
    data?: Partial<Engagement>,
    className?: string,
    waiverRequired?: boolean,
    location?: string | null,
  ) => void;
  onPrevious: () => void;
  canGoBack?: boolean;
}

export function StepClass({
  data,
  personDateOfBirth,
  initialTermId,
  allowAgeOverride = false,
  ageOverride,
  onAgeOverrideChange,
  onNext,
  onPrevious,
  canGoBack = true,
}: StepClassProps) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);

  const { classes, isLoading, error } = useClasses({ publicOnly: true });
  const { terms } = useTerms({ page: 1 });
  const { levels } = useLevels();
  const { requirements, isLoading: reqLoading } = useRequirements(selectedClassId ?? undefined);

  const classPicker = useEnrolmentClassPicker({
    personId: data.person_id,
    personDateOfBirth,
    classes,
    terms,
    allowAgeOverride,
    showAllClasses,
  });

  const levelNameById = useMemo(() => new Map(levels.map((l) => [l.id, l.name])), [levels]);

  const displaySeasonStart = useMemo(() => {
    if (initialTermId && classPicker.seasonStartById[initialTermId]) {
      return classPicker.seasonStartById[initialTermId];
    }
    const fromClass = classes.find(
      (c: { season_start_date?: string | null }) => c.season_start_date,
    )?.season_start_date;
    if (fromClass) return fromClass;
    const seasonId = classes.find((c: { season_id?: string | null }) => c.season_id)?.season_id;
    return seasonId ? classPicker.seasonStartById[seasonId] : undefined;
  }, [initialTermId, classPicker.seasonStartById, classes]);

  const studentAge = useMemo(() => {
    if (!personDateOfBirth || !displaySeasonStart) return null;
    const age = ageAt(personDateOfBirth, parseLocalDate(displaySeasonStart));
    return Number.isNaN(age) ? null : age;
  }, [personDateOfBirth, displaySeasonStart]);

  const selectedClass = useMemo(
    () => classPicker.displayClasses.find((c: { id: string }) => c.id === selectedClassId),
    [classPicker.displayClasses, selectedClassId],
  );

  const selectedClassEligible = selectedClass
    ? classPicker.isClassAgeEligible(selectedClass)
    : true;
  const selectedClassAlreadyEnrolled = selectedClass
    ? classPicker.isClassAlreadyEnrolled(selectedClass)
    : false;

  const { enrolledKeysLoading, displayClasses, isClassAlreadyEnrolled } = classPicker;

  useEffect(() => {
    if (!selectedClassId || enrolledKeysLoading) return;
    const cls = displayClasses.find((c: { id: string }) => c.id === selectedClassId);
    if (cls && isClassAlreadyEnrolled(cls)) {
      setSelectedClassId(null);
    }
  }, [selectedClassId, enrolledKeysLoading, displayClasses, isClassAlreadyEnrolled]);

  const enrolmentKeysLoading = Boolean(data.person_id && classPicker.enrolledKeysLoading);

  const selectedClassAges = selectedClass
    ? formatAgeRange(selectedClass.min_age, selectedClass.max_age)
    : null;
  const selectedClassSeasonStart = selectedClass
    ? classPicker.classSeasonStartDate(selectedClass)
    : null;
  const selectedClassStudentAge =
    personDateOfBirth && selectedClassSeasonStart
      ? personAgeAtSeasonStart(personDateOfBirth, selectedClassSeasonStart)
      : null;

  const infoNotes = useMemo(() => getRequirementInfoNotes(requirements), [requirements]);

  const handleNext = () => {
    if (!selectedClass || selectedClassAlreadyEnrolled) return;
    if (!selectedClassEligible && !(allowAgeOverride && ageOverride.confirmed)) return;
    onNext(
      {
        ...data,
        offering_id: selectedClass.id,
        season_id: selectedClass.season_id,
      },
      selectedClass.name,
      (selectedClass?.waiver_required ?? false) as boolean,
      selectedClass.location ?? null,
    );
  };

  if (isLoading || enrolmentKeysLoading) {
    return (
      <p role="status" className="text-sm text-gray-500">
        {t('common.loading')}
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  const filteredCount = classes.length - classPicker.availableClasses.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.class_desc')}</p>

      {studentAge != null && classPicker.ageFilteringActive && (
        <p className="text-sm text-gray-700" role="status">
          {enrolmentShowingForAgeMessage(studentAge, t)}
        </p>
      )}

      {studentAge != null && !classPicker.ageFilteringActive && classes.length > 0 && (
        <div
          className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"
          role="status"
        >
          {t('pages.enrolment.age_filter_inactive')}
        </div>
      )}

      {filteredCount > 0 && classPicker.ageFilteringActive && (
        <p className="text-xs text-gray-500" role="status">
          {t('pages.enrolment.classes_filtered_by_age', { count: filteredCount })}
        </p>
      )}

      {allowAgeOverride && filteredCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showAllClasses}
            onChange={(e) => setShowAllClasses(e.target.checked)}
          />
          {t('pages.enrolment.show_all_classes')}
        </label>
      )}

      {classPicker.displayClasses.length === 0 ? (
        <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-500 space-y-2">
          {classPicker.ageFilteringActive && studentAge != null ? (
            <>
              <p>{t('pages.enrolment.no_classes_for_age')}</p>
              <p className="text-xs">{enrolmentNoClassesAgeHint(studentAge, t)}</p>
            </>
          ) : (
            <p>{t('pages.enrolment.no_classes')}</p>
          )}
        </div>
      ) : (
        <EnrolmentClassSelectList
          classes={classPicker.displayClasses}
          selectedClassId={selectedClassId}
          onSelectClass={(cls) => {
            setSelectedClassId(cls.id);
            onAgeOverrideChange(false, '');
          }}
          getClassAvailability={classPicker.getClassAvailability}
          classSeasonStartDate={classPicker.classSeasonStartDate}
          personDateOfBirth={personDateOfBirth}
          ariaLabel={t('pages.enrolment.class_select_label')}
          renderClassDetails={(cls) => {
            const levelName =
              cls.level_name ?? (cls.category_id ? levelNameById.get(cls.category_id) : undefined);
            const levelLabel = levelName && levelName !== cls.name ? levelName : null;

            return (
              <>
                <p className="font-medium text-gray-900">{cls.name}</p>
                {levelLabel && <p className="text-sm text-gray-700 mt-0.5">{levelLabel}</p>}
                <p className="text-sm text-gray-500 mt-0.5">
                  {cls.day_of_week != null ? DAY_NAMES[cls.day_of_week] : ''}
                  {cls.start_time &&
                    `${cls.day_of_week != null ? ' · ' : ''}${formatTime(cls.start_time)}`}
                  {cls.end_time && `–${formatTime(cls.end_time)}`}
                </p>
                {cls.location && (
                  <p className="text-sm text-gray-500 mt-0.5">{cls.location}</p>
                )}
              </>
            );
          }}
          renderClassMeta={(cls) =>
            cls.price_minor != null && tenant ? (
              <span className="shrink-0 text-sm font-semibold text-gray-700">
                {formatOfferingPrice(
                  t,
                  computeClassTotal(
                    { price_minor: cls.price_minor, currency: cls.currency },
                    tenant,
                  ).chargeMinor,
                  cls.currency ?? tenant.currency,
                  i18n.language,
                  cls,
                )}
              </span>
            ) : null
          }
        />
      )}

      {allowAgeOverride && selectedClass && !selectedClassEligible && (
        <AgeOverridePanel
          studentAge={selectedClassStudentAge}
          classAges={selectedClassAges}
          confirmed={ageOverride.confirmed}
          reason={ageOverride.reason}
          onConfirmedChange={(confirmed) => onAgeOverrideChange(confirmed, ageOverride.reason)}
          onReasonChange={(reason) => onAgeOverrideChange(ageOverride.confirmed, reason)}
        />
      )}

      {selectedClassId && reqLoading && (
        <p className="text-sm text-gray-500">{t('pages.enrolment.loading_class_info')}</p>
      )}
      {selectedClass && infoNotes.length > 0 && (
        <div
          className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900 space-y-1"
          role="note"
        >
          <p className="font-medium">{t('pages.enrolment.class_info_heading')}</p>
          {infoNotes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} />
        <Button
          type="button"
          onClick={handleNext}
          variant="primary"
          className={canGoBack ? 'flex-1' : 'w-full'}
          disabled={
            enrolmentKeysLoading ||
            !selectedClass ||
            selectedClassAlreadyEnrolled ||
            (!selectedClassEligible && !(allowAgeOverride && ageOverride.confirmed))
          }
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
