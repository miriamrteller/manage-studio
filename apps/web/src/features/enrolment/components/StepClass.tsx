import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useRequirements } from '@/features/classes/requirements/hooks/useRequirements';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTerms } from '@/features/terms/hooks/useTerms';
import { useTenant } from '@/hooks/useTenant';
import {
  filterClassesByAge,
  getRequirementInfoNotes,
  ageAt,
  buildSeasonStartById,
  isAgeEligible,
  formatAgeRange,
  personAgeAtSeasonStart,
} from '../lib/check-requirements';
import {
  enrolmentAgeMismatchMessage,
  enrolmentNoClassesAgeHint,
  enrolmentShowingForAgeMessage,
  parseLocalDate,
} from '@/lib/personAge';
import { computeClassTotal } from '../lib/computeClassTotal';
import { formatCurrency } from '@shared/format';
import type { Engagement } from '@shared/schemas';
import type { AgeOverrideState } from '../hooks/useAgeOverride';
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
  onNext: (data?: Partial<Engagement>, className?: string, waiverRequired?: boolean) => void;
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

  const levelNameById = useMemo(() => new Map(levels.map((l) => [l.id, l.name])), [levels]);
  const seasonStartById = useMemo(() => buildSeasonStartById(terms), [terms]);
  const person = useMemo(() => ({ date_of_birth: personDateOfBirth }), [personDateOfBirth]);
  const ageCheckOptions = useMemo(() => ({ seasonStartById }), [seasonStartById]);

  const displaySeasonStart = useMemo(() => {
    if (initialTermId && seasonStartById[initialTermId]) {
      return seasonStartById[initialTermId];
    }
    const fromClass = classes.find(
      (c: { season_start_date?: string | null }) => c.season_start_date,
    )?.season_start_date;
    if (fromClass) return fromClass;
    const seasonId = classes.find((c: { season_id?: string | null }) => c.season_id)?.season_id;
    return seasonId ? seasonStartById[seasonId] : undefined;
  }, [initialTermId, seasonStartById, classes]);

  const studentAge = useMemo(() => {
    if (!personDateOfBirth || !displaySeasonStart) return null;
    const age = ageAt(personDateOfBirth, parseLocalDate(displaySeasonStart));
    return Number.isNaN(age) ? null : age;
  }, [personDateOfBirth, displaySeasonStart]);

  const { classes: availableClasses, ageFilteringActive } = useMemo(
    () => filterClassesByAge(classes, person, ageCheckOptions),
    [classes, person, ageCheckOptions],
  );

  const displayClasses = useMemo(
    () => (allowAgeOverride && showAllClasses ? classes : availableClasses),
    [allowAgeOverride, showAllClasses, classes, availableClasses],
  );

  const selectedClass = useMemo(
    () => displayClasses.find((c: { id: string }) => c.id === selectedClassId),
    [displayClasses, selectedClassId],
  );

  const classSeasonStartDate = (cls: {
    season_id?: string | null;
    season_start_date?: string | null;
  }) => {
    if (cls.season_start_date) return cls.season_start_date;
    if (cls.season_id && seasonStartById[cls.season_id]) return seasonStartById[cls.season_id];
    return null;
  };

  const selectedClassEligible = selectedClass
    ? isAgeEligible(
        {
          min_age: selectedClass.min_age,
          max_age: selectedClass.max_age,
          season_id: selectedClass.season_id,
          season_start_date: classSeasonStartDate(selectedClass),
        },
        person,
        ageCheckOptions,
      )
    : true;

  const selectedClassAges = selectedClass
    ? formatAgeRange(selectedClass.min_age, selectedClass.max_age)
    : null;
  const selectedClassSeasonStart = selectedClass ? classSeasonStartDate(selectedClass) : null;
  const selectedClassStudentAge =
    personDateOfBirth && selectedClassSeasonStart
      ? personAgeAtSeasonStart(personDateOfBirth, selectedClassSeasonStart)
      : null;

  const infoNotes = useMemo(() => getRequirementInfoNotes(requirements), [requirements]);

  const handleNext = () => {
    if (!selectedClass) return;
    if (!selectedClassEligible && !(allowAgeOverride && ageOverride.confirmed)) return;
    onNext(
      {
        ...data,
        offering_id: selectedClass.id,
        season_id: selectedClass.season_id,
      },
      selectedClass.name,
      (selectedClass?.waiver_required ?? false) as boolean,
    );
  };

  if (isLoading) {
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

  const filteredCount = classes.length - availableClasses.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.class_desc')}</p>

      {studentAge != null && ageFilteringActive && (
        <p className="text-sm text-gray-700" role="status">
          {enrolmentShowingForAgeMessage(studentAge, t)}
        </p>
      )}

      {studentAge != null && !ageFilteringActive && classes.length > 0 && (
        <div
          className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"
          role="status"
        >
          {t('pages.enrolment.age_filter_inactive')}
        </div>
      )}

      {filteredCount > 0 && ageFilteringActive && (
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

      {displayClasses.length === 0 ? (
        <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-500 space-y-2">
          {ageFilteringActive && studentAge != null ? (
            <>
              <p>{t('pages.enrolment.no_classes_for_age')}</p>
              <p className="text-xs">{enrolmentNoClassesAgeHint(studentAge, t)}</p>
            </>
          ) : (
            <p>{t('pages.enrolment.no_classes')}</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2" role="listbox" aria-label={t('pages.enrolment.class_select_label')}>
          {displayClasses.map(
            (cls: {
              id: string;
              name: string;
              category_id?: string | null;
              day_of_week?: number;
              start_time?: string;
              end_time?: string;
              min_age?: number | null;
              max_age?: number | null;
              level_name?: string | null;
              price_minor?: number;
              currency?: string;
            }) => {
              const isSelected = cls.id === selectedClassId;
              const levelName =
                cls.level_name ?? (cls.category_id ? levelNameById.get(cls.category_id) : undefined);
              const levelLabel = levelName && levelName !== cls.name ? levelName : null;
              const eligible = isAgeEligible(
                {
                  min_age: cls.min_age,
                  max_age: cls.max_age,
                  season_id: (cls as { season_id?: string | null }).season_id ?? null,
                  season_start_date: classSeasonStartDate(
                    cls as { season_id?: string | null; season_start_date?: string | null },
                  ),
                },
                person,
                ageCheckOptions,
              );
              return (
                <li key={cls.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      onAgeOverrideChange(false, '');
                    }}
                    className={[
                      'w-full text-start border-2 rounded-lg px-4 py-3 transition-colors',
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : eligible
                          ? 'border-gray-200 hover:border-gray-300 bg-white'
                          : 'border-amber-300 hover:border-amber-400 bg-amber-50/40',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{cls.name}</p>
                        {levelLabel && (
                          <p className="text-sm text-gray-700 mt-0.5">{levelLabel}</p>
                        )}
                        <p className="text-sm text-gray-500 mt-0.5">
                          {cls.day_of_week != null ? DAY_NAMES[cls.day_of_week] : ''}
                          {cls.start_time &&
                            `${cls.day_of_week != null ? ' · ' : ''}${formatTime(cls.start_time)}`}
                          {cls.end_time && `–${formatTime(cls.end_time)}`}
                        </p>
                      </div>
                      {cls.price_minor != null && tenant && (
                        <span className="shrink-0 text-sm font-semibold text-gray-700">
                          {formatCurrency(
                            computeClassTotal(
                              { price_minor: cls.price_minor, currency: cls.currency },
                              tenant,
                            ).chargeMinor,
                            cls.currency ?? tenant.currency,
                            i18n.language,
                          )}
                        </span>
                      )}
                    </div>
                    {!eligible && (
                      <p className="text-xs text-amber-800 mt-1">
                        {t('pages.enrolment.ineligible_age')}
                      </p>
                    )}
                  </button>
                </li>
              );
            },
          )}
        </ul>
      )}

      {allowAgeOverride &&
        selectedClass &&
        !selectedClassEligible &&
        selectedClassAges &&
        selectedClassStudentAge != null && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
            <p>{enrolmentAgeMismatchMessage(selectedClassStudentAge, selectedClassAges, t)}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ageOverride.confirmed}
                onChange={(e) => onAgeOverrideChange(e.target.checked, ageOverride.reason)}
              />
              {t('pages.enrolment.age_override_label')}
            </label>
            <textarea
              className="w-full rounded border border-amber-300 p-2 text-sm bg-white"
              placeholder={t('pages.enrolment.age_override_reason_placeholder')}
              value={ageOverride.reason}
              onChange={(e) => onAgeOverrideChange(ageOverride.confirmed, e.target.value)}
            />
          </div>
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
            !selectedClass ||
            (!selectedClassEligible && !(allowAgeOverride && ageOverride.confirmed))
          }
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
