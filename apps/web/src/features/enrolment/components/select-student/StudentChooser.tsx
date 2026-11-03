import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatEnrolmentStudentAgeLine } from '@/lib/personAge';
import { filterStudentCandidates } from '../../lib/filterStudentCandidates';
import { isAgeEligible } from '../../lib/check-requirements';
import type { EnrolmentConstraints, EnrolmentMode } from '../../hooks/useEnrolmentContext';
import type { GuardianProfile } from '../../onboardingService';
import type { StudentWithEnrolments } from '../../hooks/useAccountStudents';
import { GuardianProfileSetupPanel } from '../GuardianProfileSetupPanel';
import { EligibleStudentButton, IneligibleStudentRow } from './StudentChoiceRows';
import type { SelectStudentSubMode } from './types';

/** Default screen: the family's students (parent), or new-person buttons (admin). */
export function StudentChooser({
  mode,
  isAdultIntake,
  constraints,
  guardian,
  guardianSetupRequired,
  guardianAccountId,
  guardianAccountMemberId,
  students,
  guardianPersonId,
  studentsLoading,
  studentsError,
  onSelectPerson,
  onChangeSubMode,
  onCancel,
}: {
  mode: EnrolmentMode;
  isAdultIntake: boolean;
  constraints: EnrolmentConstraints;
  guardian: GuardianProfile | null;
  guardianSetupRequired: boolean;
  guardianAccountId?: string;
  guardianAccountMemberId?: string;
  students: StudentWithEnrolments[];
  guardianPersonId: string | null;
  studentsLoading: boolean;
  studentsError: Error | null;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onChangeSubMode: (subMode: SelectStudentSubMode) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();

  const { eligible, ineligible } = useMemo(
    () =>
      filterStudentCandidates(
        students,
        { ...constraints, actor: mode === 'admin' ? 'admin' : mode === 'guest' ? 'guest' : 'parent' },
        guardianPersonId,
      ),
    [students, constraints, guardianPersonId, mode],
  );

  // Age eligibility for the guardian themselves — used to offer self-enrolment in parent mode.
  const guardianAgeEligible = useMemo(() => {
    if (!guardian) return true;
    if (!constraints.ageBand) return true;
    const { min_age, max_age } = constraints.ageBand;
    if (min_age == null && max_age == null) return true;
    if (!guardian.dateOfBirth) return true;
    return isAgeEligible(
      constraints.ageBand,
      { date_of_birth: guardian.dateOfBirth },
      { referenceDate: constraints.seasonStartDate ?? undefined },
    );
  }, [guardian, constraints]);

  const ineligibleIds = useMemo(
    () => new Set(ineligible.map((item) => item.person.id)),
    [ineligible],
  );

  const needsGuardianForm = mode === 'guest' || mode === 'admin' || !guardian?.accountId;

  const handleSelect = (person: StudentWithEnrolments) => {
    if (ineligibleIds.has(person.id)) return;
    onSelectPerson(person.id, person.date_of_birth ?? null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.select_student_desc')}</p>

      {guardianSetupRequired && (guardian || (guardianAccountId && guardianAccountMemberId)) && (
        <GuardianProfileSetupPanel
          mode={guardian ? 'update_dob' : 'create'}
          personId={guardian?.personId}
          defaultName={guardian?.name ?? ''}
          defaultDateOfBirth={guardian?.dateOfBirth ?? ''}
          accountId={guardian?.accountId ?? guardianAccountId!}
          accountMemberId={guardian?.accountMemberId ?? guardianAccountMemberId!}
          onComplete={(personId, dateOfBirth) => onSelectPerson(personId, dateOfBirth)}
        />
      )}

      {studentsLoading && <p role="status">{t('common.loading')}</p>}
      {studentsError && (
        <p role="alert" className="text-sm text-red-600">
          {studentsError.message}
        </p>
      )}

      {!studentsLoading && mode === 'parent' && !guardianSetupRequired && (
        <ul className="space-y-2" aria-label={t('pages.enrolment.select_student_desc')}>
          {eligible.map((student) => (
            <li key={student.id}>
              <EligibleStudentButton student={student} onClick={() => handleSelect(student)} />
            </li>
          ))}
          {ineligible.map(({ person, reason }) => (
            <li key={person.id}>
              <IneligibleStudentRow name={person.name} reason={reason} />
            </li>
          ))}
          {guardian && guardianAgeEligible && (
            <li key={guardian.personId}>
              <button
                type="button"
                onClick={() => onSelectPerson(guardian.personId, guardian.dateOfBirth ?? null)}
                className="w-full rounded-lg border-2 border-blue-600 p-4 text-start hover:bg-blue-50 transition"
              >
                <span className="block font-medium">
                  {guardian.name}{' '}
                  <span className="text-sm font-normal text-gray-500">({t('pages.enrolment.enrol_myself')})</span>
                </span>
                <span className="block text-sm text-gray-600">
                  {formatEnrolmentStudentAgeLine(guardian.dateOfBirth, t) || t('pages.enrolment.no_current_enrolments')}
                </span>
              </button>
            </li>
          )}
          {guardian && !guardianAgeEligible && (
            <li key={`guardian-ineligible-${guardian.personId}`}>
              <div className="w-full rounded-lg border border-gray-200 p-4 opacity-60">
                <span className="block font-medium">
                  {guardian.name}{' '}
                  <span className="text-sm font-normal text-gray-500">({t('pages.enrolment.enrol_myself')})</span>
                </span>
                <span className="block text-xs text-amber-700">
                  {t('pages.enrolment.ineligible_age')}
                </span>
              </div>
            </li>
          )}
        </ul>
      )}

      {mode === 'parent' && !guardianSetupRequired && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onChangeSubMode(needsGuardianForm ? 'new_family' : 'new_child')}
        >
          {needsGuardianForm
            ? t('pages.enrolment.create_new_student')
            : t('pages.enrolment.add_new_child')}
        </Button>
      )}

      {mode === 'admin' && !isAdultIntake && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={() => onChangeSubMode('new_adult')}>
            {t('pages.enrolment.person_new_adult')}
          </Button>
        </>
      )}

      {mode === 'admin' && isAdultIntake && (
        <Button type="button" variant="outline" className="w-full" onClick={() => onChangeSubMode('new_adult')}>
          {t('pages.enrolment.create_new_adult')}
        </Button>
      )}

      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
