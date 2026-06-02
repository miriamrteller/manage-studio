import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PersonSearchCombobox } from '@/components/shared/PersonSearchCombobox';
import { GuestExistingAccountPrompt } from './GuestExistingAccountPrompt';
import { useGuestEmailRegistrationCheck } from '../hooks/useGuestEmailRegistrationCheck';
import { isExistingEmailError } from '../intakeService';
import { filterStudentCandidates, studentAgeLabel } from '../lib/filterStudentCandidates';
import type { PersonSearchResult } from '@/features/people/types';
import {
  filterEnrolmentPersonSearchResults,
  isEnrolmentGuardianOnly,
  isEnrolmentPersonSearchSelectable,
} from '../lib/enrolmentPersonSearch';
import { useAdminGuardianEmailLookup } from '../hooks/useAdminGuardianEmailLookup';
import { useFamilyStudents, partitionFamilyStudents } from '../hooks/useFamilyStudents';
import type { Person } from '@shared/schemas';
import type { EnrolmentConstraints, EnrolmentMode } from '../hooks/useEnrolmentContext';
import type { GuardianAccountLookup, GuardianProfile } from '../onboardingService';
import type { StudentWithEnrolments } from '../hooks/useAccountStudents';

interface EnrolmentPersonSearchComboboxProps {
  onSelectPerson: (person: Person, dateOfBirth: string | null) => void;
  onSelectGuardian: (result: PersonSearchResult) => void;
  constraints: EnrolmentConstraints;
  isAdultIntake?: boolean;
  disabled?: boolean;
}

function EnrolmentPersonSearchCombobox({
  onSelectPerson,
  onSelectGuardian,
  constraints,
  isAdultIntake = false,
  disabled = false,
}: EnrolmentPersonSearchComboboxProps) {
  const { t } = useTranslation();

  return (
    <PersonSearchCombobox
      disabled={disabled}
      label={t('pages.enrolment.admin_search_label')}
      placeholder={t('pages.enrolment.admin_search_placeholder')}
      emptyMessage={t('pages.enrolment.admin_search_empty')}
      filterResults={(results) => filterEnrolmentPersonSearchResults(results, constraints)}
      isSelectable={(result) =>
        isEnrolmentPersonSearchSelectable(result, constraints, isAdultIntake)
      }
      renderResultBadge={(result) =>
        isEnrolmentGuardianOnly(result, isAdultIntake)
          ? t('pages.enrolment.admin_badge_family')
          : t('pages.enrolment.admin_badge_student')
      }
      renderIneligibleHint={(result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          return t('pages.enrolment.admin_parent_pick_child');
        }
        return constraints.ageBand ? t('pages.enrolment.ineligible_age') : null;
      }}
      renderSubtitle={(result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          return t('pages.enrolment.admin_parent_row_hint');
        }
        return undefined;
      }}
      onSelect={(person, result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          onSelectGuardian(result);
          return;
        }
        onSelectPerson(person, person.date_of_birth ?? null);
      }}
    />
  );
}

interface StepSelectStudentProps {
  mode: EnrolmentMode;
  isAdultIntake?: boolean;
  constraints: EnrolmentConstraints;
  guardian: GuardianProfile | null;
  students: StudentWithEnrolments[];
  guardianPersonId: string | null;
  studentsLoading: boolean;
  studentsError: Error | null;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onCreateMinor: (fields: { student_name: string; student_date_of_birth: string }) => Promise<void>;
  onCreateAdult: (fields: {
    name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
  }) => Promise<void>;
  onCreateMinorWithGuardian: (fields: {
    student_name: string;
    student_date_of_birth: string;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    existing_account_id?: string;
  }) => Promise<void>;
  onCancel?: () => void;
  onSignInRequest?: () => void;
}

type SubMode = 'choose' | 'new_child' | 'new_adult' | 'new_family' | 'pick_child';

function initialSubMode(mode: EnrolmentMode, isAdultIntake: boolean): SubMode {
  if (mode === 'guest') {
    return isAdultIntake ? 'new_adult' : 'new_family';
  }
  return 'choose';
}

export function StepSelectStudent({
  mode,
  isAdultIntake = false,
  constraints,
  guardian,
  students,
  guardianPersonId,
  studentsLoading,
  studentsError,
  onSelectPerson,
  onCreateMinor,
  onCreateAdult,
  onCreateMinorWithGuardian,
  onCancel,
  onSignInRequest,
}: StepSelectStudentProps) {
  const { t } = useTranslation();
  const [subMode, setSubMode] = useState<SubMode>(() => initialSubMode(mode, isAdultIntake));
  const [error, setError] = useState<string | null>(null);
  const [forceExistingEmailPrompt, setForceExistingEmailPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [adultName, setAdultName] = useState('');
  const [adultEmail, setAdultEmail] = useState('');
  const [adultPhone, setAdultPhone] = useState('');
  const [adultDob, setAdultDob] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [pickChildAccountId, setPickChildAccountId] = useState<string | null>(null);
  const [pickChildGuardianName, setPickChildGuardianName] = useState('');
  const [pickChildGuardianEmail, setPickChildGuardianEmail] = useState('');
  const [linkedFamily, setLinkedFamily] = useState<GuardianAccountLookup | null>(null);

  const guestEmailCheckEnabled = mode === 'guest' && Boolean(onSignInRequest);
  const adminEmailCheckEnabled = mode === 'admin' && subMode === 'new_family';
  const guardianEmailCheck = useGuestEmailRegistrationCheck(
    guardianEmail,
    guestEmailCheckEnabled && subMode === 'new_family',
  );
  const adminGuardianLookup = useAdminGuardianEmailLookup(guardianEmail, adminEmailCheckEnabled);
  const adultEmailCheck = useGuestEmailRegistrationCheck(
    adultEmail,
    guestEmailCheckEnabled && subMode === 'new_adult',
  );

  const showGuardianExistingPrompt =
    guestEmailCheckEnabled &&
    (guardianEmailCheck.registered || forceExistingEmailPrompt) &&
    subMode === 'new_family';
  const showAdminExistingFamily =
    mode === 'admin' && subMode === 'new_family' && Boolean(linkedFamily ?? adminGuardianLookup.existingFamily);
  const resolvedLinkedFamily = linkedFamily ?? adminGuardianLookup.existingFamily;
  const showAdultExistingPrompt =
    guestEmailCheckEnabled &&
    (adultEmailCheck.registered || forceExistingEmailPrompt) &&
    subMode === 'new_adult';

  const { eligible, ineligible } = useMemo(
    () => filterStudentCandidates(students, constraints, guardianPersonId),
    [students, constraints, guardianPersonId],
  );

  const ineligibleIds = useMemo(
    () => new Set(ineligible.map((item) => item.person.id)),
    [ineligible],
  );

  const needsGuardianForm = mode === 'guest' || mode === 'admin' || !guardian?.accountId;

  const handleSelect = (person: StudentWithEnrolments) => {
    if (ineligibleIds.has(person.id)) return;
    onSelectPerson(person.id, person.date_of_birth ?? null);
  };

  if (mode === 'admin' && subMode === 'choose') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.enrolment.admin_select_desc')}</p>
        <EnrolmentPersonSearchCombobox
          constraints={constraints}
          isAdultIntake={isAdultIntake}
          onSelectPerson={(person, dob) => onSelectPerson(person.id, dob)}
          onSelectGuardian={(result) => {
            if (!result.familyAccountId) return;
            setPickChildAccountId(result.familyAccountId);
            setPickChildGuardianName(result.person.name);
            setPickChildGuardianEmail(result.person.email ?? result.guardianEmail ?? '');
            setSubMode('pick_child');
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setLinkedFamily(null);
            setGuardianEmail('');
            setGuardianName('');
            setGuardianPhone('');
            setSubMode('new_family');
          }}
        >
          {t('pages.enrolment.add_child_to_family')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  if (mode === 'admin' && subMode === 'pick_child' && pickChildAccountId) {
    return (
      <AdminPickChildStep
        accountId={pickChildAccountId}
        guardianName={pickChildGuardianName}
        constraints={constraints}
        onSelectPerson={onSelectPerson}
        onAddNewChild={() => {
          if (!pickChildAccountId) return;
          setLinkedFamily({
            accountId: pickChildAccountId,
            guardianPersonId: '',
            guardianName: pickChildGuardianName,
            guardianEmail: pickChildGuardianEmail || null,
          });
          if (pickChildGuardianEmail) {
            setGuardianEmail(pickChildGuardianEmail);
          }
          setPickChildAccountId(null);
          setPickChildGuardianName('');
          setPickChildGuardianEmail('');
          setSubMode('new_family');
        }}
        onBack={() => {
          setPickChildAccountId(null);
          setPickChildGuardianName('');
          setPickChildGuardianEmail('');
          setSubMode('choose');
        }}
      />
    );
  }

  if (subMode === 'new_family') {
    const clearLinkedFamily = () => {
      setLinkedFamily(null);
      setGuardianEmail('');
      setGuardianName('');
      setGuardianPhone('');
    };

    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setForceExistingEmailPrompt(false);
          if (showGuardianExistingPrompt) return;
          setIsSubmitting(true);
          try {
            const guardianNameForSubmit =
              resolvedLinkedFamily?.guardianName ?? guardianName;
            await onCreateMinorWithGuardian({
              student_name: studentName,
              student_date_of_birth: studentDob,
              guardian_name: guardianNameForSubmit,
              guardian_email: guardianEmail || undefined,
              guardian_phone: showAdminExistingFamily ? undefined : guardianPhone || undefined,
              existing_account_id: resolvedLinkedFamily?.accountId,
            });
          } catch (err) {
            if (isExistingEmailError(err)) {
              setForceExistingEmailPrompt(true);
              setError(null);
            } else {
              setError(err instanceof Error ? err.message : t('common.error'));
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">
          {mode === 'guest'
            ? t('pages.enrolment.guest_new_family_desc')
            : showAdminExistingFamily
              ? t('pages.enrolment.admin_add_child_desc')
              : t('pages.enrolment.new_minor_desc')}
        </p>

        {showAdminExistingFamily && resolvedLinkedFamily ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-2">
            <p className="font-medium">{t('pages.enrolment.linked_family')}</p>
            <p>{resolvedLinkedFamily.guardianName}</p>
            {(resolvedLinkedFamily.guardianEmail ?? guardianEmail) && (
              <p>{resolvedLinkedFamily.guardianEmail ?? guardianEmail}</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={clearLinkedFamily}>
              {t('pages.enrolment.change_family')}
            </Button>
          </div>
        ) : (
          <fieldset className="border rounded p-4 space-y-3">
            <legend className="text-sm font-semibold px-1">{t('pages.enrolment.guardian_section')}</legend>
            {mode === 'admin' && (
              <input
                type="email"
                required
                className="form-input w-full"
                value={guardianEmail}
                onChange={(e) => {
                  setGuardianEmail(e.target.value);
                  setForceExistingEmailPrompt(false);
                  setLinkedFamily(null);
                }}
                placeholder={t('form.person.email')}
              />
            )}
            {mode === 'admin' && adminGuardianLookup.isChecking && (
              <p className="text-sm text-gray-500" role="status">
                {t('common.loading')}
              </p>
            )}
            {mode === 'admin' &&
              !adminGuardianLookup.isChecking &&
              guardianEmail.trim() &&
              !resolvedLinkedFamily && (
                <p className="text-sm text-gray-600" role="status">
                  {t('pages.enrolment.admin_new_family_hint')}
                </p>
              )}
            <input
              type="text"
              required
              className="form-input w-full"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              placeholder={t('form.person.name')}
            />
            {mode !== 'admin' && (
              <input
                type="email"
                required
                className="form-input w-full"
                value={guardianEmail}
                onChange={(e) => {
                  setGuardianEmail(e.target.value);
                  setForceExistingEmailPrompt(false);
                }}
                placeholder={t('form.person.email')}
              />
            )}
            {showGuardianExistingPrompt && onSignInRequest && (
              <GuestExistingAccountPrompt onSignIn={onSignInRequest} />
            )}
            <input
              type="tel"
              className="form-input w-full"
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder={t('form.person.phone')}
            />
          </fieldset>
        )}

        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
          <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder={t('form.person.name')} />
          <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {mode !== 'guest' && (
            <Button type="button" variant="outline" className="flex-1" onClick={() => {
              clearLinkedFamily();
              setSubMode('choose');
            }}>
              {t('common.back')}
            </Button>
          )}
          {mode === 'guest' && onCancel && (
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={isSubmitting || showGuardianExistingPrompt || guardianEmailCheck.isChecking}
          >
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  if (subMode === 'new_adult') {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setForceExistingEmailPrompt(false);
          if (showAdultExistingPrompt) return;
          setIsSubmitting(true);
          try {
            await onCreateAdult({
              name: adultName,
              email: adultEmail || undefined,
              phone: adultPhone || undefined,
              date_of_birth: adultDob || undefined,
            });
          } catch (err) {
            if (isExistingEmailError(err)) {
              setForceExistingEmailPrompt(true);
              setError(null);
            } else {
              setError(err instanceof Error ? err.message : t('common.error'));
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">
          {mode === 'guest'
            ? t('pages.enrolment.guest_adult_desc')
            : t('pages.enrolment.new_adult_desc')}
        </p>
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.personal_section')}</legend>
          <input
            type="text"
            required
            className="form-input w-full"
            value={adultName}
            onChange={(e) => setAdultName(e.target.value)}
            placeholder={t('form.person.name')}
          />
          <input
            type="email"
            required={mode === 'guest'}
            className="form-input w-full"
            value={adultEmail}
            onChange={(e) => {
              setAdultEmail(e.target.value);
              setForceExistingEmailPrompt(false);
            }}
            placeholder={t('form.person.email')}
          />
          {showAdultExistingPrompt && onSignInRequest && (
            <GuestExistingAccountPrompt onSignIn={onSignInRequest} />
          )}
          <input
            type="tel"
            className="form-input w-full"
            value={adultPhone}
            onChange={(e) => setAdultPhone(e.target.value)}
            placeholder={t('form.person.phone')}
          />
          <input
            type="date"
            className="form-input w-full"
            value={adultDob}
            onChange={(e) => setAdultDob(e.target.value)}
            placeholder={t('form.person.date_of_birth')}
          />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {mode !== 'guest' && (
            <Button type="button" variant="outline" className="flex-1" onClick={() => setSubMode('choose')}>
              {t('common.back')}
            </Button>
          )}
          {mode === 'guest' && onCancel && (
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={isSubmitting || showAdultExistingPrompt || adultEmailCheck.isChecking}
          >
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  if (subMode === 'new_child') {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setIsSubmitting(true);
          try {
            await onCreateMinor({ student_name: studentName, student_date_of_birth: studentDob });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">{t('pages.enrolment.new_child_desc')}</p>
        {guardian && (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
            <p className="font-medium">{t('pages.enrolment.guardian_section')}</p>
            <p>{guardian.name}</p>
            {guardian.email && <p>{guardian.email}</p>}
            {guardian.phone && <p>{guardian.phone}</p>}
          </div>
        )}
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
          <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setSubMode('choose')}>
            {t('common.back')}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.select_student_desc')}</p>

      {studentsLoading && <p role="status">{t('common.loading')}</p>}
      {studentsError && (
        <p role="alert" className="text-sm text-red-600">
          {studentsError.message}
        </p>
      )}

      {!studentsLoading && mode === 'parent' && (
        <ul className="space-y-2" aria-label={t('pages.enrolment.select_student_desc')}>
          {eligible.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => handleSelect(student)}
                className="w-full rounded-lg border-2 border-blue-600 p-4 text-start hover:bg-blue-50 transition"
              >
                <span className="block font-medium">{student.name}</span>
                <span className="block text-sm text-gray-600">
                  {[
                    student.date_of_birth
                      ? t('pages.enrolment.student_age', {
                          age: studentAgeLabel(student.date_of_birth) ?? '—',
                        })
                      : null,
                    student.activeClassNames.length > 0
                      ? t('pages.enrolment.enrolled_in', { classes: student.activeClassNames.join(', ') })
                      : t('pages.enrolment.no_current_enrolments'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {ineligible.map(({ person, reason }) => (
            <li key={person.id}>
              <div className="w-full rounded-lg border border-gray-200 p-4 opacity-60">
                <span className="block font-medium">{person.name}</span>
                <span className="block text-xs text-amber-700">
                  {reason === 'age'
                    ? t('pages.enrolment.ineligible_age')
                    : t('pages.enrolment.ineligible_account')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === 'parent' && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setSubMode(needsGuardianForm ? 'new_family' : 'new_child')}
        >
          {needsGuardianForm
            ? t('pages.enrolment.create_new_student')
            : t('pages.enrolment.add_new_child')}
        </Button>
      )}

      {mode === 'admin' && !isAdultIntake && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={() => setSubMode('new_adult')}>
            {t('pages.enrolment.person_new_adult')}
          </Button>
        </>
      )}

      {mode === 'admin' && isAdultIntake && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setSubMode('new_adult')}>
          {t('pages.enrolment.create_new_adult')}
        </Button>
      )}

      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

function AdminPickChildStep({
  accountId,
  guardianName,
  constraints,
  onSelectPerson,
  onAddNewChild,
  onBack,
}: {
  accountId: string;
  guardianName: string;
  constraints: EnrolmentConstraints;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onAddNewChild: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const familyQuery = useFamilyStudents(accountId, true);
  const { eligible, ineligible } = useMemo(
    () =>
      partitionFamilyStudents(
        familyQuery.data?.students ?? [],
        familyQuery.data?.guardianPersonId ?? null,
        constraints,
      ),
    [familyQuery.data, constraints],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('pages.enrolment.admin_pick_child_desc', { name: guardianName })}
      </p>

      {familyQuery.isLoading && <p role="status">{t('common.loading')}</p>}
      {familyQuery.error instanceof Error && (
        <p role="alert" className="text-sm text-red-600">
          {familyQuery.error.message}
        </p>
      )}

      {!familyQuery.isLoading && eligible.length === 0 && ineligible.length === 0 && (
        <p className="text-sm text-gray-500">{t('pages.enrolment.admin_no_children')}</p>
      )}

      {!familyQuery.isLoading && (
        <ul className="space-y-2" aria-label={t('pages.enrolment.admin_pick_child_desc', { name: guardianName })}>
          {eligible.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => onSelectPerson(student.id, student.date_of_birth ?? null)}
                className="w-full rounded-lg border-2 border-blue-600 p-4 text-start hover:bg-blue-50 transition"
              >
                <span className="block font-medium">{student.name}</span>
                <span className="block text-sm text-gray-600">
                  {[
                    student.date_of_birth
                      ? t('pages.enrolment.student_age', {
                          age: studentAgeLabel(student.date_of_birth) ?? '—',
                        })
                      : null,
                    student.activeClassNames.length > 0
                      ? t('pages.enrolment.enrolled_in', { classes: student.activeClassNames.join(', ') })
                      : t('pages.enrolment.no_current_enrolments'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {ineligible.map(({ person, reason }) => (
            <li key={person.id}>
              <div className="w-full rounded-lg border border-gray-200 p-4 opacity-60">
                <span className="block font-medium">{person.name}</span>
                <span className="block text-xs text-amber-700">
                  {reason === 'age'
                    ? t('pages.enrolment.ineligible_age')
                    : t('pages.enrolment.ineligible_account')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="w-full" onClick={onAddNewChild}>
        {t('pages.enrolment.add_new_child_to_family')}
      </Button>

      <Button type="button" variant="outline" className="w-full" onClick={onBack}>
        {t('common.back')}
      </Button>
    </div>
  );
}
