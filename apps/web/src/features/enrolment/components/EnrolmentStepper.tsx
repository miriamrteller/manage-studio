import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StepSelectStudent } from './StepSelectStudent';
import { StepClass } from './StepClass';
import { StepNotification } from './StepNotification';
import { StepAdminCheckout } from './StepAdminCheckout';
import { StepCheckout } from './StepCheckout';
import { StepConfirmation } from './StepConfirmation';
import { WaiverStep } from './WaiverStep';
import { WaiverSignedSummary } from './WaiverSignedSummary';
import { GuestVerifyStep } from './GuestVerifyStep';
import { useEnrolment } from '../hooks/useEnrolment';
import { useEnrolmentContext } from '../hooks/useEnrolmentContext';
import { useAccountStudents } from '../hooks/useAccountStudents';
import { useEnrolmentStepNavigation } from '../hooks/useEnrolmentStepNavigation';
import { usePersonStepAutoSkip } from '../hooks/usePersonStepAutoSkip';
import { useCheckoutPreparation, type UseCheckoutPreparationParams } from '../hooks/useCheckoutPreparation';
import { useWaiverFlowState } from '../hooks/useWaiverFlowState';
import { useAdminCompletionState } from '../hooks/useAdminCompletionState';
import { useAgeOverride } from '../hooks/useAgeOverride';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  EnrolmentOnboardingService,
  type NewAdultOnboardingInput,
  type NewMinorOnboardingInput,
} from '../onboardingService';
import { EnrolmentIntakeService } from '../intakeService';
import { EnrolmentService } from '../service';
import { isOfferingEnrolled } from '../lib/enrolled-offerings';
import { usePersonExistingEnrolments } from '../hooks/usePersonExistingEnrolments';
import { hasParentRole } from '@/lib/parentRoles';
import { getSelectedClassAgeError } from '../lib/selectedClassAgeValidation';
import type { EnrollmentIntent } from '@/lib/enrollment-intent';
import { persistEnrollmentIntent } from '@/lib/enrollment-intent';
import type { Engagement } from '@shared/schemas';
import type { EnrolmentStepperProps } from '../types/enrolmentStep';

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
  const [selectedClassName, setSelectedClassName] = useState('');
  const [personStepSkipped, setPersonStepSkipped] = useState(false);
  const [guestGuardianEmail, setGuestGuardianEmail] = useState<string | null>(null);

  const { classAgeOverride, setClassAgeOverride, handleClassAgeOverrideChange } = useAgeOverride();
  const classPreselected = Boolean(initialClassId && initialTermId);
  const showGuestVerifyStep = false;

  const enrolledPersonId =
    enrolmentData.person_id ?? enrolmentContext.preselectedPersonId ?? undefined;
  const { data: enrolledOfferingKeys, isLoading: enrolledKeysLoading } =
    usePersonExistingEnrolments(enrolledPersonId);

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

  const waiverFlow = useWaiverFlowState({
    enrolmentContextWaiverRequired: enrolmentContext.waiverRequired,
    enrolmentContextMode: enrolmentContext.mode,
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
    };

  const { checkoutEnrolmentId, checkoutError, isCheckoutPreparing, resetCheckoutState, setCheckoutError } =
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
    if (classPreselected && (enrolledKeysLoading || preselectedAlreadyEnrolled)) return;

    if (classPreselected && dob) {
      const ageError = getSelectedClassAgeError(enrolmentContext.constraints, dob, t);
      if (ageError) {
        if (enrolmentContext.mode === 'admin' && classAgeOverride.confirmed) {
          setPersonAgeError(null);
        } else {
          setPersonAgeError(ageError);
          return;
        }
      } else {
        setPersonAgeError(ageError);
      }
    }
    setPersonAgeError(null);
    if (newData) setEnrolmentData((prev) => ({ ...prev, ...newData }));
    setPersonDateOfBirth(dob ?? null);
    goToNextStep();
  };

  const handleClassNext = (
    newData?: Partial<Engagement>,
    className?: string,
    waiverRequired?: boolean,
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
    if (waiverRequired !== undefined) waiverFlow.setLocalWaiverRequired(waiverRequired);
    goToNextStep();
  };

  const mergeAndAdvance = (newData?: Partial<Engagement>) => {
    if (newData) setEnrolmentData((prev) => ({ ...prev, ...newData }));
    goToNextStep();
  };

  const handlePaymentSuccess = async () => {
    if (!checkoutEnrolmentId || !tenant) return;

    const poll = async (attempts = 10): Promise<Engagement | null> => {
      const enrolment = await EnrolmentService.get(
        {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          language: tenant.language_default,
          country: tenant.country,
          currency: tenant.currency,
          vat_rate: tenant.vat_rate,
          prices_include_vat: tenant.prices_include_vat,
        },
        checkoutEnrolmentId,
      );
      if (enrolment.status === 'active' || enrolment.status === 'pending_waiver') return enrolment;
      if (attempts <= 0) return enrolment;
      await new Promise((r) => setTimeout(r, 1500));
      return poll(attempts - 1);
    };

    try {
      const enrolment = await poll();
      setCurrentStep('confirmation');
      if (enrolment) {
        setEnrolmentData(enrolment);
      }
      sessionStorage.setItem('portalEngagementId', checkoutEnrolmentId);
    } catch (error) {
      console.error('Failed to confirm enrolment after payment:', error);
      setCheckoutError(t('enrolment.payment_confirm_pending'));
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h2 className="text-xl font-semibold text-gray-900">{stepTitles[currentStep]}</h2>
        <p className="text-sm text-gray-600 mt-2">
          {t('enrolment.step')} {currentStepIndex + 1} of {steps.length}
        </p>
      </div>

      <div className="flex gap-2">
        {steps.map((step, index) => (
          <div
            key={step}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{
              backgroundColor:
                index < currentStepIndex
                  ? 'var(--color-success)'
                  : index === currentStepIndex
                    ? 'var(--color-info)'
                    : 'var(--color-neutral-300)',
            }}
          />
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        {currentStep === 'person' && (
          <>
            {enrolmentContext.isLoading && (
              <p role="status">{t('common.loading')}</p>
            )}
            {enrolmentContext.error && (
              <p role="alert" className="text-sm text-red-600">
                {enrolmentContext.error.message}
              </p>
            )}
            {!enrolmentContext.isLoading &&
              classPreselected &&
              enrolledKeysLoading && (
                <p role="status">{t('common.loading')}</p>
              )}
            {!enrolmentContext.isLoading && classPreselected && preselectedAlreadyEnrolled && (
              <div
                className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900 space-y-3"
                role="status"
              >
                <p>
                  {enrolmentContext.mode === 'admin'
                    ? t('pages.enrolment.already_enrolled_preselected_admin')
                    : t('pages.enrolment.already_enrolled_preselected')}
                </p>
                {user && hasParentRole(user.role) && enrolmentContext.mode !== 'admin' && (
                  <Button type="button" variant="primary" onClick={() => navigate('/dashboard/portal')}>
                    {t('pages.portal.view_enrolment')}
                  </Button>
                )}
                {enrolmentContext.mode === 'admin' && (
                  <Button type="button" variant="primary" onClick={() => navigate('/classes')}>
                    {t('pages.enrol_complete.browse_classes')}
                  </Button>
                )}
              </div>
            )}
            {!enrolmentContext.isLoading && !enrolmentContext.canSkipPersonStep && (
              <>
                {personAgeError && (
                  <div
                    className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 space-y-2"
                    role="alert"
                  >
                    <p>{personAgeError}</p>
                    {classPreselected && enrolmentContext.mode === 'admin' && (
                      <>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={classAgeOverride.confirmed}
                            onChange={(e) =>
                              setClassAgeOverride((prev) => ({
                                ...prev,
                                confirmed: e.target.checked,
                              }))
                            }
                          />
                          {t('pages.enrolment.age_override_label')}
                        </label>
                        <textarea
                          className="w-full rounded border border-red-300 p-2 text-sm bg-white text-gray-900"
                          placeholder={t('pages.enrolment.age_override_reason_placeholder')}
                          value={classAgeOverride.reason}
                          onChange={(e) =>
                            setClassAgeOverride((prev) => ({
                              ...prev,
                              reason: e.target.value,
                            }))
                          }
                        />
                      </>
                    )}
                  </div>
                )}
                <StepSelectStudent
                  mode={enrolmentContext.mode}
                  isAdultIntake={enrolmentContext.isAdultIntake}
                  constraints={enrolmentContext.constraints}
                  allowAgeOverride={classPreselected && enrolmentContext.mode === 'admin'}
                  ageOverrideConfirmed={classAgeOverride.confirmed}
                  guardian={enrolmentContext.guardian}
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
                  onCreateMinor={async (fields) => {
                    if (!tenant || !enrolmentContext.guardian?.accountId) {
                      throw new Error(t('pages.enrolment.no_account_linked'));
                    }
                    const person = await EnrolmentOnboardingService.createChildForAccount(
                      tenant,
                      enrolmentContext.guardian.accountId,
                      fields,
                    );
                    handlePersonNext(
                      { ...enrolmentData, person_id: person.id },
                      fields.student_date_of_birth,
                    );
                  }}
                  onCreateAdult={async (fields) => {
                    if (!tenant) throw new Error(t('common.error'));
                    if (enrolmentContext.mode === 'guest') {
                      if (!fields.email) {
                        throw new Error(t('pages.enrolment.guardian_email_required'));
                      }
                      const result = await EnrolmentIntakeService.createGuestAdult(tenant, {
                        name: fields.name,
                        email: fields.email,
                        phone: fields.phone,
                        dateOfBirth: fields.date_of_birth,
                      });
                      setGuestGuardianEmail(result.email);
                      handlePersonNext(
                        { ...enrolmentData, person_id: result.personId },
                        fields.date_of_birth ?? null,
                      );
                      return;
                    }
                    const { person } = await EnrolmentOnboardingService.createAdultSolo(
                      tenant,
                      fields as NewAdultOnboardingInput,
                    );
                    handlePersonNext(
                      { ...enrolmentData, person_id: person.id },
                      person.date_of_birth ?? null,
                    );
                  }}
                  onCreateMinorWithGuardian={async (fields) => {
                    if (!tenant) throw new Error(t('common.error'));
                    if (enrolmentContext.mode === 'guest') {
                      if (!fields.guardian_email) {
                        throw new Error(t('pages.enrolment.guardian_email_required'));
                      }
                      const result = await EnrolmentIntakeService.createGuestFamily(tenant, {
                        guardian: {
                          name: fields.guardian_name,
                          email: fields.guardian_email,
                          phone: fields.guardian_phone,
                        },
                        student: {
                          name: fields.student_name,
                          dateOfBirth: fields.student_date_of_birth,
                        },
                      });
                      setGuestGuardianEmail(result.guardianEmail);
                      handlePersonNext(
                        { ...enrolmentData, person_id: result.studentPersonId },
                        fields.student_date_of_birth,
                      );
                      return;
                    }
                    if (fields.existing_account_id) {
                      const person = await EnrolmentOnboardingService.createChildForAccount(
                        tenant,
                        fields.existing_account_id,
                        {
                          student_name: fields.student_name,
                          student_date_of_birth: fields.student_date_of_birth,
                        },
                      );
                      handlePersonNext(
                        { ...enrolmentData, person_id: person.id },
                        fields.student_date_of_birth,
                      );
                      return;
                    }
                    const person = await EnrolmentOnboardingService.createStudentWithGuardianEmail(
                      tenant,
                      {
                        ...fields,
                        guardian_role: 'account_holder',
                      } as NewMinorOnboardingInput,
                    );
                    handlePersonNext(
                      { ...enrolmentData, person_id: person.id },
                      fields.student_date_of_birth,
                    );
                  }}
                  onCancel={onCancel}
                  onSignInRequest={
                    enrolmentContext.mode === 'guest' ? handleGuestSignIn : undefined
                  }
                />
              </>
            )}
          </>
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

        {currentStep === 'waiver' &&
          (waiverFlow.waiverSignedInFlow && waiverFlow.waiverStatus?.template ? (
            <WaiverSignedSummary
              template={waiverFlow.waiverStatus.template}
              signedAt={waiverFlow.waiverSignedAt}
              canGoBack={canGoBack}
              onPrevious={handlePreviousStep}
              onContinue={() => goToNextStep()}
            />
          ) : waiverFlow.waiverStatus?.template ? (
            <WaiverStep
              personId={enrolmentData.person_id!}
              template={waiverFlow.waiverStatus.template}
              offeringId={(enrolmentData.offering_id ?? initialClassId)!}
              accountMemberId={enrolmentContext.guardian?.accountMemberId}
              studentName={waiverFlow.waiverPersonDisplay?.name ?? undefined}
              className={selectedClassName || undefined}
              termName={waiverFlow.waiverTermDisplay?.name}
              isMinorStudent={waiverFlow.isMinorStudent}
              signerIsTheStudent={waiverFlow.signerIsTheStudent}
              tenantIdForInvalidation={tenant?.id}
              onComplete={(evidenceId) => {
                waiverFlow.markWaiverSigned(evidenceId);
                goToNextStep();
              }}
              onPrevious={handlePreviousStep}
              canGoBack={canGoBack}
            />
          ) : (
            <div className="space-y-4">
              {!waiverFlow.waiverStatus || !waiverFlow.waiverStatus.template ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t('enrolment.waiver_loading', { defaultValue: 'Loading waiver…' })}
                </p>
              ) : (
                <p className="text-sm text-destructive" role="alert">
                  {t('enrolment.waiver_no_template', {
                    defaultValue:
                      'No active waiver template is set up. Please ask a studio administrator to add a waiver template before enrolling.',
                  })}
                </p>
              )}
              <div className="flex justify-between pt-2">
                {canGoBack && (
                  <Button variant="outline" onClick={handlePreviousStep}>
                    {t('common.back')}
                  </Button>
                )}
              </div>
            </div>
          ))}

        {currentStep === 'checkout' && enrolmentContext.mode === 'admin' && (
          <StepAdminCheckout
            enrolmentData={enrolmentData}
            checkoutEnrolmentId={checkoutEnrolmentId}
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
            checkoutError={checkoutError}
            isPreparing={isCheckoutPreparing || (isCreating && !checkoutEnrolmentId)}
            requireAuth={enrolmentContext.mode !== 'guest' && Boolean(user)}
            onPaymentSuccess={handlePaymentSuccess}
            onPrevious={handlePreviousStep}
            canGoBack={canGoBack}
          />
        )}

        {currentStep === 'confirmation' && (
          <StepConfirmation
            enrolment={enrolmentData as Engagement}
            className={selectedClassName}
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
      </div>
    </div>
  );
}
