import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StepSelectStudent } from './StepSelectStudent';
import { StepClass } from './StepClass';
import { StepNotification } from './StepNotification';
import { StepAdminCheckout } from './StepAdminCheckout';
import { StepCheckout } from './StepCheckout';
import { StepConfirmation } from './StepConfirmation';
import { GuestVerifyStep } from './GuestVerifyStep';
import { EnrolmentStepHeader } from './stepper/EnrolmentStepHeader';
import { PersonStepPanel } from './stepper/PersonStepPanel';
import { WaiverStepPanel } from './stepper/WaiverStepPanel';
import { useEnrolment } from '../hooks/useEnrolment';
import { useEnrolmentContext } from '../hooks/useEnrolmentContext';
import { useAccountStudents } from '../hooks/useAccountStudents';
import { useEnrolmentStepNavigation } from '../hooks/useEnrolmentStepNavigation';
import { usePersonStepAutoSkip } from '../hooks/usePersonStepAutoSkip';
import { useCheckoutPreparation, type UseCheckoutPreparationParams } from '../hooks/useCheckoutPreparation';
import { useWaiverFlowState } from '../hooks/useWaiverFlowState';
import { useAdminCompletionState } from '../hooks/useAdminCompletionState';
import { useAgeOverride } from '../hooks/useAgeOverride';
import { useEnrolmentAgeReviewRequest } from '../hooks/useEnrolmentAgeReviewRequest';
import { useEnrolmentPaymentSuccess } from '../hooks/useEnrolmentPaymentSuccess';
import { useEnrolmentPersonCreation } from '../hooks/useEnrolmentPersonCreation';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isOfferingEnrolled } from '../lib/enrolled-offerings';
import { isUnder18 } from '../lib/isUnder18';
import { usePersonExistingEnrolments } from '../hooks/usePersonExistingEnrolments';
import { getSelectedClassAgeError } from '../lib/selectedClassAgeValidation';
import type { AgeEnrolmentActor } from '../lib/ageEnrolmentPolicy';
import type { EnrollmentIntent } from '@/lib/enrollment-intent';
import { clearEnrollmentIntent, persistEnrollmentIntent } from '@/lib/enrollment-intent';
import type { Engagement } from '@shared/schemas';
import type { EnrolmentStepperProps } from '../types/enrolmentStep';
import { PrivacyNotice } from '@/components/PrivacyNotice';

export type { EnrolmentStep, EnrolmentStepperProps } from '../types/enrolmentStep';

/**
 * Multi-step wizard for class enrolment.
 * Coordinates step navigation, waiver gating, checkout preparation, and step views.
 */
export function EnrolmentStepper({
  initialClassId,
  initialTermId,
  initialStep = 'person',
  skipNotificationStep = false,
  enrollmentIntent = null,
  initialResumeState = null,
  onSuccess,
  onCancel,
}: EnrolmentStepperProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  void initialResumeState;

  const enrolmentContext = useEnrolmentContext(enrollmentIntent);
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const { isCreating } = useEnrolment({ enabled: false });

  const [enrolmentData, setEnrolmentData] = useState<Partial<Engagement>>(() => ({
    ...(initialClassId ? { offering_id: initialClassId } : {}),
    ...(initialTermId ? { season_id: initialTermId } : {}),
  }));
  const [personDateOfBirth, setPersonDateOfBirth] = useState<string | null>(null);
  const [personAgeError, setPersonAgeError] = useState<string | null>(null);
  const [attemptedPersonDob, setAttemptedPersonDob] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedClassLocation, setSelectedClassLocation] = useState<string | null>(null);
  const [personStepSkipped, setPersonStepSkipped] = useState(false);
  const [guestGuardianEmail, setGuestGuardianEmail] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const { classAgeOverride, setClassAgeOverride, handleClassAgeOverrideChange } = useAgeOverride();
  const classPreselected = Boolean(initialClassId && initialTermId);
  const enrolmentActor: AgeEnrolmentActor =
    enrolmentContext.mode === 'admin'
      ? 'admin'
      : enrolmentContext.mode === 'guest'
        ? 'guest'
        : 'parent';
  const showGuestVerifyStep = false;

  useEffect(() => {
    const offering = enrolmentContext.selectedOffering;
    if (initialClassId && offering) {
      setSelectedClassName(offering.name);
      setSelectedClassLocation(offering.location ?? null);
    }
  }, [initialClassId, enrolmentContext.selectedOffering]);

  const enrolledPersonId =
    enrolmentData.person_id ?? enrolmentContext.preselectedPersonId ?? undefined;

  const waiverFlow = useWaiverFlowState({
    enrolmentContextWaiverRequired: enrolmentContext.waiverRequired,
    personId: enrolmentData.person_id,
    offeringId: enrolmentData.offering_id,
    initialClassId,
    seasonId: enrolmentData.season_id,
  });

  const adminCompletion = useAdminCompletionState();

  const {
    currentStep,
    setCurrentStep,
    steps,
    stepTitles,
    currentStepIndex,
    canGoBack,
    goToNextStep,
    handlePreviousStep: baseHandlePreviousStep,
  } = useEnrolmentStepNavigation({
    initialStep,
    classPreselected,
    skipNotificationStep,
    showGuestVerifyStep,
    showWaiverStep: waiverFlow.showWaiverStep,
    personStepSkipped,
    canSkipPersonStep: enrolmentContext.canSkipPersonStep,
    onCancel,
  });

  const { data: enrolledOfferingKeys, isLoading: enrolledKeysLoading } =
    usePersonExistingEnrolments(enrolledPersonId, currentStep !== 'checkout');

  const preselectedAlreadyEnrolled = useMemo(() => {
    if (!classPreselected || !initialClassId || !initialTermId || !enrolledPersonId) {
      return false;
    }
    if (enrolledKeysLoading) return false;
    return isOfferingEnrolled(enrolledOfferingKeys, initialClassId, initialTermId);
  }, [
    classPreselected,
    initialClassId,
    initialTermId,
    enrolledPersonId,
    enrolledKeysLoading,
    enrolledOfferingKeys,
  ]);

  const checkoutParams: UseCheckoutPreparationParams = {
      currentStep,
      setCurrentStep,
      tenant,
      personId: enrolmentData.person_id,
      offeringId: enrolmentData.offering_id,
      seasonId: enrolmentData.season_id,
      setEnrolmentData,
      mode: enrolmentContext.mode,
      user,
      classPreselected,
      personDateOfBirth,
      classAgeOverride,
      constraints: enrolmentContext.constraints,
      showWaiverStep: waiverFlow.showWaiverStep,
      waiverSignedInFlow: waiverFlow.waiverSignedInFlow,
      waiverEvidenceId: waiverFlow.waiverEvidenceId,
      enrolledOfferingKeys,
      navigate,
      t,
      reviewSubmitted,
    };

  const { checkoutEnrolmentId, checkoutCharge, checkoutError, isCheckoutPreparing, resetCheckoutState, setCheckoutError } =
    useCheckoutPreparation(checkoutParams);

  const handlePreviousStep = () => {
    if (currentStep === 'checkout') {
      resetCheckoutState();
    }
    baseHandlePreviousStep();
  };

  const handlePersonLoaded = useCallback((personId: string, dateOfBirth: string | null) => {
    setEnrolmentData((prev) => ({ ...prev, person_id: personId }));
    setPersonDateOfBirth(dateOfBirth);
  }, []);

  usePersonStepAutoSkip({
    tenant,
    enrolmentContext,
    userPersonId: user?.person_id,
    personId: enrolmentData.person_id,
    personStepSkipped,
    setPersonStepSkipped,
    currentStep,
    setCurrentStep,
    steps,
    onPersonLoaded: handlePersonLoaded,
    blockAutoSkip:
      classPreselected &&
      Boolean(enrolledPersonId) &&
      (enrolledKeysLoading ||
        isOfferingEnrolled(enrolledOfferingKeys, initialClassId ?? '', initialTermId ?? '')),
  });

  const accountStudentsQuery = useAccountStudents({
    accountId: enrolmentContext.constraints.accountId ?? enrolmentContext.guardian?.accountId,
    enabled:
      currentStep !== 'checkout' &&
      enrolmentContext.mode === 'parent' &&
      !enrolmentContext.canSkipPersonStep &&
      !enrolmentContext.isLoading &&
      !enrolmentContext.error &&
      Boolean(enrolmentContext.guardian?.accountId ?? enrolmentContext.constraints.accountId),
  });

  const handleGuestSignIn = () => {
    const intent: EnrollmentIntent = {
      classId: initialClassId ?? enrolmentData.offering_id,
      seasonId: initialTermId ?? enrolmentData.season_id ?? undefined,
      mode: 'parent',
    };
    persistEnrollmentIntent(intent);
    navigate('/login', {
      state: {
        from: '/enrol',
        ...intent,
      },
    });
  };

  const handlePersonNext = (newData?: Partial<Engagement>, dob?: string | null) => {
    if (reviewSubmitted) return;
    if (classPreselected && (enrolledKeysLoading || preselectedAlreadyEnrolled)) return;

    if (classPreselected && dob) {
      const ageError = getSelectedClassAgeError(enrolmentContext.constraints, dob, t, {
        actor: enrolmentActor,
        ageOverrideConfirmed: classAgeOverride.confirmed,
      });
      if (ageError) {
        if (enrolmentContext.mode === 'admin' && classAgeOverride.confirmed) {
          setPersonAgeError(null);
          setAttemptedPersonDob(null);
        } else {
          setPersonAgeError(ageError);
          setAttemptedPersonDob(dob);
          return;
        }
      } else {
        setPersonAgeError(ageError);
        setAttemptedPersonDob(null);
      }
    }
    setPersonAgeError(null);
    setAttemptedPersonDob(null);
    if (newData) setEnrolmentData((prev) => ({ ...prev, ...newData }));
    setPersonDateOfBirth(dob ?? null);
    goToNextStep();
  };

  const { handleAgeReviewRequest, ageReviewSubmitting, ageReviewError } =
    useEnrolmentAgeReviewRequest({
      tenant,
      mode: enrolmentContext.mode,
      constraints: enrolmentContext.constraints,
      initialClassId,
      initialTermId,
      personDateOfBirth,
      enrolmentActor,
      selectedClassName,
      setEnrolmentData,
      setReviewSubmitted,
      t,
    });

  const handleClassNext = (
    newData?: Partial<Engagement>,
    className?: string,
    waiverRequired?: boolean,
    location?: string | null,
  ) => {
    if (
      newData?.offering_id &&
      newData?.season_id &&
      isOfferingEnrolled(enrolledOfferingKeys, newData.offering_id, newData.season_id)
    ) {
      return;
    }
    if (newData) setEnrolmentData((prev) => ({ ...prev, ...newData }));
    if (className) setSelectedClassName(className);
    if (location !== undefined) setSelectedClassLocation(location);
    if (waiverRequired !== undefined) waiverFlow.setLocalWaiverRequired(waiverRequired);
    goToNextStep();
  };

  const mergeAndAdvance = (newData?: Partial<Engagement>) => {
    if (newData) setEnrolmentData((prev) => ({ ...prev, ...newData }));
    goToNextStep();
  };

  // Confirmation reached (card payment done, or admin finished): the enrolment no longer
  // needs the stored intent. Without this, a header/logo click to /dashboard before closing
  // the confirmation would loop back to /enrol.
  useEffect(() => {
    if (currentStep === 'confirmation') clearEnrollmentIntent();
  }, [currentStep]);

  const handlePaymentSuccess = useEnrolmentPaymentSuccess({
    tenant,
    checkoutEnrolmentId,
    setCurrentStep,
    setEnrolmentData,
    setCheckoutError,
    t,
  });

  const personCreation = useEnrolmentPersonCreation({
    tenant,
    enrolmentContext,
    enrolmentData,
    handlePersonNext,
    setGuestGuardianEmail,
    t,
  });

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <EnrolmentStepHeader
        currentStep={currentStep}
        currentStepIndex={currentStepIndex}
        steps={steps}
        stepTitles={stepTitles}
      />

      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        {currentStep === 'person' && (
          <PersonStepPanel
            enrolmentContext={enrolmentContext}
            user={user}
            classPreselected={classPreselected}
            enrolledKeysLoading={enrolledKeysLoading}
            preselectedAlreadyEnrolled={preselectedAlreadyEnrolled}
            reviewSubmitted={reviewSubmitted}
            personAgeError={personAgeError}
            attemptedPersonDob={attemptedPersonDob}
            classAgeOverride={classAgeOverride}
            setClassAgeOverride={setClassAgeOverride}
          >
            <StepSelectStudent
              mode={enrolmentContext.mode}
              isAdultIntake={enrolmentContext.isAdultIntake}
              constraints={enrolmentContext.constraints}
              allowAgeOverride={classPreselected && enrolmentContext.mode === 'admin'}
              ageOverrideConfirmed={classAgeOverride.confirmed}
              classPreselected={classPreselected}
              selectedClassName={selectedClassName}
              enrolmentActor={enrolmentActor}
              onSubmitAgeReview={classPreselected ? handleAgeReviewRequest : undefined}
              ageReviewSubmitting={ageReviewSubmitting}
              ageReviewError={ageReviewError}
              onBrowseClasses={() => navigate('/classes')}
              guardian={enrolmentContext.guardian}
              guardianSetupRequired={enrolmentContext.guardianSetupRequired}
              guardianAccountId={enrolmentContext.guardianAccountId}
              guardianAccountMemberId={enrolmentContext.guardianAccountMemberId}
              students={accountStudentsQuery.data?.students ?? []}
              guardianPersonId={accountStudentsQuery.data?.guardianPersonId ?? null}
              studentsLoading={accountStudentsQuery.isLoading}
              studentsError={
                enrolmentContext.error
                  ? null
                  : accountStudentsQuery.error instanceof Error
                    ? accountStudentsQuery.error
                    : null
              }
              onSelectPerson={(personId, dob) =>
                handlePersonNext({ ...enrolmentData, person_id: personId }, dob)
              }
              onCreateMinor={personCreation.onCreateMinor}
              onCreateAdult={personCreation.onCreateAdult}
              onCreateMinorWithGuardian={personCreation.onCreateMinorWithGuardian}
              onCancel={onCancel}
              onSignInRequest={
                enrolmentContext.mode === 'guest' ? handleGuestSignIn : undefined
              }
            />
          </PersonStepPanel>
        )}

        {currentStep === 'class' && (
          <StepClass
            data={enrolmentData}
            personDateOfBirth={personDateOfBirth}
            initialTermId={initialTermId}
            allowAgeOverride={enrolmentContext.mode === 'admin'}
            ageOverride={classAgeOverride}
            onAgeOverrideChange={handleClassAgeOverrideChange}
            onNext={handleClassNext}
            onPrevious={handlePreviousStep}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'notification' && !skipNotificationStep && (
          <StepNotification
            onNext={mergeAndAdvance}
            onPrevious={handlePreviousStep}
            onSkip={() => mergeAndAdvance()}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'verify_email' && (
          <GuestVerifyStep
            guestEmail={guestGuardianEmail}
            onContinue={mergeAndAdvance}
            onPrevious={handlePreviousStep}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'waiver' && (
          <WaiverStepPanel
            waiverFlow={waiverFlow}
            enrolmentData={enrolmentData}
            enrolmentContext={enrolmentContext}
            initialClassId={initialClassId}
            selectedClassName={selectedClassName}
            tenantId={tenant?.id}
            canGoBack={canGoBack}
            onPrevious={handlePreviousStep}
            onNext={() => goToNextStep()}
          />
        )}

        {currentStep === 'checkout' && enrolmentContext.mode === 'admin' && (
          <StepAdminCheckout
            enrolmentData={enrolmentData}
            checkoutEnrolmentId={checkoutEnrolmentId}
            checkoutCharge={checkoutCharge}
            checkoutError={checkoutError}
            isPreparing={isCheckoutPreparing || (isCreating && !checkoutEnrolmentId)}
            onComplete={(result) => {
              adminCompletion.recordAdminCompletion(result);
              setCurrentStep('confirmation');
            }}
            onPrevious={handlePreviousStep}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'checkout' && enrolmentContext.mode !== 'admin' && (
          <StepCheckout
            enrolmentData={enrolmentData}
            checkoutEnrolmentId={checkoutEnrolmentId}
            checkoutCharge={checkoutCharge}
            checkoutError={checkoutError}
            isPreparing={isCheckoutPreparing || (isCreating && !checkoutEnrolmentId)}
            requireAuth={enrolmentContext.mode !== 'guest' && Boolean(user)}
            acceptedByRole={isUnder18(personDateOfBirth) ? 'guardian' : 'self'}
            studentName={waiverFlow.waiverPersonDisplay?.name ?? undefined}
            onPaymentSuccess={handlePaymentSuccess}
            onPrevious={handlePreviousStep}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'confirmation' && (
          <StepConfirmation
            enrolment={enrolmentData as Engagement}
            className={selectedClassName}
            location={selectedClassLocation}
            guardianEmail={guestGuardianEmail}
            adminDoneMessage={adminCompletion.adminDoneMessage}
            adminPaymentChoice={adminCompletion.adminPaymentChoice}
            adminCompletionLink={adminCompletion.adminCompletionLink}
            adminLinkEmailSent={adminCompletion.adminLinkEmailSent}
            adminLinkWarning={adminCompletion.adminLinkWarning}
            adminEngagementId={checkoutEnrolmentId}
            closeLabel={
              enrolmentContext.mode === 'parent'
                ? t('pages.portal.view_enrolment', { defaultValue: 'View in portal' })
                : undefined
            }
            onClose={() => onSuccess?.(enrolmentData as Engagement)}
          />
        )}
        {currentStep !== 'confirmation' && enrolmentContext.mode !== 'admin' && (
          <PrivacyNotice purpose="enrolment" className="mt-4" />
        )}
      </div>
    </div>
  );
}
