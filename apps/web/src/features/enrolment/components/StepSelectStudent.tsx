import { useMemo, useState } from 'react';
import { useGuestEmailRegistrationCheck } from '../hooks/useGuestEmailRegistrationCheck';
import { ADULT_AGE_THRESHOLD, ageAt } from '@/lib/personAge';
import { useSelectedClassAgeValidation } from '../lib/selectedClassAgeValidation';
import { useAdminGuardianEmailLookup } from '../hooks/useAdminGuardianEmailLookup';
import { useSelectStudentFields } from '../hooks/useSelectStudentFields';
import { useStepSelectStudentAgeReview } from '../hooks/useStepSelectStudentAgeReview';
import type { EnrolmentConstraints, EnrolmentMode } from '../hooks/useEnrolmentContext';
import type { AgeEnrolmentActor } from '../lib/ageEnrolmentPolicy';
import type { GuardianAccountLookup, GuardianProfile } from '../onboardingService';
import type { StudentWithEnrolments } from '../hooks/useAccountStudents';
import { AdminChooseStep } from './select-student/AdminChooseStep';
import { AdminPickChildStep } from './select-student/AdminPickChildStep';
import { NewFamilyForm } from './select-student/NewFamilyForm';
import { NewAdultForm } from './select-student/NewAdultForm';
import { NewChildForm } from './select-student/NewChildForm';
import { StudentChooser } from './select-student/StudentChooser';
import type {
  SelectStudentFormState,
  SelectStudentSubMode,
  SharedAgeAlertProps,
} from './select-student/types';

interface StepSelectStudentProps {
  mode: EnrolmentMode;
  isAdultIntake?: boolean;
  constraints: EnrolmentConstraints;
  allowAgeOverride?: boolean;
  ageOverrideConfirmed?: boolean;
  classPreselected?: boolean;
  selectedClassName?: string;
  enrolmentActor?: AgeEnrolmentActor;
  onSubmitAgeReview?: (input: {
    note: string;
    personId: string;
    studentName: string;
  }) => Promise<void>;
  ageReviewSubmitting?: boolean;
  ageReviewError?: string | null;
  onBrowseClasses?: () => void;
  guardian: GuardianProfile | null;
  guardianSetupRequired?: boolean;
  guardianAccountId?: string;
  guardianAccountMemberId?: string;
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

function initialSubMode(mode: EnrolmentMode, isAdultIntake: boolean): SelectStudentSubMode {
  if (mode === 'guest') {
    return isAdultIntake ? 'new_adult' : 'new_family';
  }
  return 'choose';
}

export function StepSelectStudent({
  mode,
  isAdultIntake = false,
  constraints,
  allowAgeOverride = false,
  ageOverrideConfirmed = false,
  classPreselected = false,
  selectedClassName = '',
  enrolmentActor = 'parent',
  onSubmitAgeReview,
  ageReviewSubmitting = false,
  ageReviewError = null,
  onBrowseClasses,
  guardian,
  guardianSetupRequired = false,
  guardianAccountId,
  guardianAccountMemberId,
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
  const canBypassAgeBlock = allowAgeOverride && ageOverrideConfirmed;
  const showAgeReviewInsteadOfNext =
    classPreselected &&
    !canBypassAgeBlock &&
    enrolmentActor !== 'admin' &&
    Boolean(onSubmitAgeReview);

  const [subMode, setSubMode] = useState<SelectStudentSubMode>(() => initialSubMode(mode, isAdultIntake));
  const [error, setError] = useState<string | null>(null);
  const [forceExistingEmailPrompt, setForceExistingEmailPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fields = useSelectStudentFields();
  const { studentDob, adultEmail, adultDob, guardianEmail } = fields;
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

  const studentDobAgeCheck = useSelectedClassAgeValidation(constraints, studentDob, {
    actor: mode === 'admin' ? 'admin' : mode === 'guest' ? 'guest' : 'parent',
    ageOverrideConfirmed: canBypassAgeBlock ? true : undefined,
  });
  const adultDobAgeCheck = useSelectedClassAgeValidation(constraints, adultDob, {
    actor: mode === 'admin' ? 'admin' : mode === 'guest' ? 'guest' : 'parent',
    ageOverrideConfirmed: canBypassAgeBlock ? true : undefined,
  });
  const adultAge = useMemo(() => (adultDob ? ageAt(adultDob) : NaN), [adultDob]);
  const adultNeedsGuardian = useMemo(() => {
    if (!adultDob) return false;
    if (Number.isNaN(adultAge)) return false;
    return adultAge < ADULT_AGE_THRESHOLD;
  }, [adultDob, adultAge]);

  const { submitAgeReviewRequest, localAgeReviewError } = useStepSelectStudentAgeReview({
    mode,
    subMode,
    fields,
    guardian,
    resolvedLinkedFamily,
    adultNeedsGuardian,
    onSubmitAgeReview,
    setIsSubmitting,
    setForceExistingEmailPrompt,
  });

  const studentDobBlocked =
    studentDobAgeCheck.blocked && !canBypassAgeBlock && !showAgeReviewInsteadOfNext;
  const adultDobBlocked =
    adultDobAgeCheck.blocked && !canBypassAgeBlock && !showAgeReviewInsteadOfNext;

  const ageAlert: SharedAgeAlertProps = {
    constraints,
    actor: enrolmentActor,
    ageOverrideConfirmed,
    className: selectedClassName,
    onSubmitAgeReview: showAgeReviewInsteadOfNext ? submitAgeReviewRequest : undefined,
    onBrowseClasses,
    ageReviewSubmitting: ageReviewSubmitting || isSubmitting,
    ageReviewError: ageReviewError ?? localAgeReviewError,
  };

  const formState: SelectStudentFormState = {
    error,
    setError,
    isSubmitting,
    setIsSubmitting,
    setForceExistingEmailPrompt,
  };

  const clearPickChild = () => {
    setPickChildAccountId(null);
    setPickChildGuardianName('');
    setPickChildGuardianEmail('');
  };

  if (mode === 'admin' && subMode === 'choose') {
    return (
      <AdminChooseStep
        constraints={constraints}
        isAdultIntake={isAdultIntake}
        onSelectPerson={onSelectPerson}
        onSelectGuardian={(result) => {
          if (!result.familyAccountId) return;
          setPickChildAccountId(result.familyAccountId);
          setPickChildGuardianName(result.person.name);
          setPickChildGuardianEmail(result.person.email ?? result.guardianEmail ?? '');
          setSubMode('pick_child');
        }}
        onNewFamily={() => {
          setLinkedFamily(null);
          fields.setGuardianEmail('');
          fields.setGuardianName('');
          fields.setGuardianPhone('');
          setSubMode('new_family');
        }}
        onNewAdult={() => setSubMode('new_adult')}
        onCancel={onCancel}
      />
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
            fields.setGuardianEmail(pickChildGuardianEmail);
          }
          clearPickChild();
          setSubMode('new_family');
        }}
        onBack={() => {
          clearPickChild();
          setSubMode('choose');
        }}
      />
    );
  }

  if (subMode === 'new_family') {
    return (
      <NewFamilyForm
        mode={mode}
        fields={fields}
        formState={formState}
        ageAlert={ageAlert}
        studentDobBlocked={studentDobBlocked}
        showGuardianExistingPrompt={showGuardianExistingPrompt}
        showAdminExistingFamily={showAdminExistingFamily}
        resolvedLinkedFamily={resolvedLinkedFamily}
        adminLookupChecking={adminGuardianLookup.isChecking}
        guardianEmailChecking={guardianEmailCheck.isChecking}
        onUnlinkFamily={() => setLinkedFamily(null)}
        onCreateMinorWithGuardian={onCreateMinorWithGuardian}
        onBack={() => setSubMode('choose')}
        onCancel={onCancel}
        onSignInRequest={onSignInRequest}
      />
    );
  }

  if (subMode === 'new_adult') {
    return (
      <NewAdultForm
        mode={mode}
        fields={fields}
        formState={formState}
        ageAlert={ageAlert}
        adultDobBlocked={adultDobBlocked}
        adultAge={adultAge}
        adultNeedsGuardian={adultNeedsGuardian}
        showAdultExistingPrompt={showAdultExistingPrompt}
        adultEmailChecking={adultEmailCheck.isChecking}
        onCreateAdult={onCreateAdult}
        onCreateMinorWithGuardian={onCreateMinorWithGuardian}
        onBack={() => setSubMode('choose')}
        onCancel={onCancel}
        onSignInRequest={onSignInRequest}
      />
    );
  }

  if (subMode === 'new_child') {
    return (
      <NewChildForm
        guardian={guardian}
        fields={fields}
        formState={formState}
        ageAlert={ageAlert}
        studentDobBlocked={studentDobBlocked}
        onCreateMinor={onCreateMinor}
        onBack={() => setSubMode('choose')}
      />
    );
  }

  return (
    <StudentChooser
      mode={mode}
      isAdultIntake={isAdultIntake}
      constraints={constraints}
      guardian={guardian}
      guardianSetupRequired={guardianSetupRequired}
      guardianAccountId={guardianAccountId}
      guardianAccountMemberId={guardianAccountMemberId}
      students={students}
      guardianPersonId={guardianPersonId}
      studentsLoading={studentsLoading}
      studentsError={studentsError}
      onSelectPerson={onSelectPerson}
      onChangeSubMode={setSubMode}
      onCancel={onCancel}
    />
  );
}
