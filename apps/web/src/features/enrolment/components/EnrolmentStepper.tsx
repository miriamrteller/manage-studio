import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsAppOtpVerifier } from '@/components/notifications';
import { useEnrolment } from '../hooks/useEnrolment';
import type { Enrolment } from '@shared/schemas';

export type EnrolmentStep = 'person' | 'class' | 'notification' | 'checkout' | 'confirmation';

export interface EnrolmentStepperProps {
  /**
   * Initial step (default: 'person')
   * Can be used to skip steps for returning customers
   */
  initialStep?: EnrolmentStep;
  
  /**
   * Skip notification step if user already verified
   */
  skipNotificationStep?: boolean;
  
  /**
   * Callback when enrolment is successfully created
   */
  onSuccess?: (enrolment: Enrolment) => void;
  
  /**
   * Callback when user cancels enrolment
   */
  onCancel?: () => void;
}

/**
 * Component: EnrolmentStepper
 * Multi-step wizard for class enrolment
 * 
 * Flow:
 * 1. Person identification (new or returning)
 * 2. Class selection with requirements validation
 * 3. WhatsApp notification opt-in (NEW in Phase 1D)
 * 4. Checkout with payment
 * 5. Confirmation with next steps
 * 
 * Each step manages its own state, parent coordinates via step transitions
 */
export function EnrolmentStepper({
  initialStep = 'person',
  skipNotificationStep = false,
  onSuccess,
  onCancel,
}: EnrolmentStepperProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<EnrolmentStep>(initialStep);
  const [enrolmentData, setEnrolmentData] = useState<Partial<Enrolment>>({});
  
  const { createEnrolment, isCreating } = useEnrolment();

  const steps: EnrolmentStep[] = [
    'person',
    'class',
    skipNotificationStep ? undefined : 'notification',
    'checkout',
    'confirmation',
  ].filter((s): s is EnrolmentStep => !!s);

  const stepTitles: Record<EnrolmentStep, string> = {
    person: t('enrolment.step_person') || 'Identify Person',
    class: t('enrolment.step_class') || 'Select Class',
    notification: t('enrolment.step_notification') || 'Notifications',
    checkout: t('enrolment.step_checkout') || 'Payment',
    confirmation: t('enrolment.step_confirmation') || 'Confirmation',
  };

  const currentStepIndex = steps.indexOf(currentStep);

  const handleNextStep = (newData?: Partial<Enrolment>) => {
    if (newData) {
      setEnrolmentData({ ...enrolmentData, ...newData });
    }
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    // Calculate confidence score for enrolment (0-1 scale)
    // Checks: person_id, class_id, contact_preferences defined
    const missingFields = [
      !enrolmentData.person_id ? 'person_id' : null,
      !enrolmentData.class_id ? 'class_id' : null,
    ].filter(Boolean);
    
    const confidence = missingFields.length === 0 ? 1.0 : 0.5;

    // AI liability guard: Enrolment is a financial transaction
    // Low confidence (<0.70) requires human-in-the-loop review
    if (confidence < 0.70) {
      console.warn(
        '[HITL-REQUIRED] Low confidence enrolment, needs human review',
        {
          confidence,
          missingFields,
          enrolmentData,
        }
      );
      // Show error to user
      throw new Error(
        'Enrolment validation failed. Please complete all required fields.'
      );
    }

    createEnrolment(
      {
        ...enrolmentData,
        status: 'active',
      },
      {
        onSuccess: (created) => {
          setCurrentStep('confirmation');
          setEnrolmentData(created);
          onSuccess?.(created);
        },
        onError: (error) => {
          console.error('Enrolment creation failed:', error);
        },
      }
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h2 className="text-xl font-semibold text-gray-900">{stepTitles[currentStep]}</h2>
        <p className="text-sm text-gray-600 mt-2">
          {t('enrolment.step')} {currentStepIndex + 1} of {steps.length}
        </p>
      </div>

      {/* Stepper progress bar */}
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

      {/* Step content */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        {currentStep === 'person' && (
          <StepPerson
            data={enrolmentData}
            onNext={handleNextStep}
            onCancel={onCancel}
          />
        )}

        {currentStep === 'class' && (
          <StepClass
            data={enrolmentData}
            onNext={handleNextStep}
            onPrevious={handlePreviousStep}
          />
        )}

        {currentStep === 'notification' && !skipNotificationStep && (
          <StepNotification
            onNext={handleNextStep}
            onPrevious={handlePreviousStep}
            onSkip={() => handleNextStep()}
          />
        )}

        {currentStep === 'checkout' && (
          <StepCheckout
            enrolmentData={enrolmentData}
            onSubmit={handleSubmit}
            onPrevious={handlePreviousStep}
            isLoading={isCreating}
          />
        )}

        {currentStep === 'confirmation' && (
          <StepConfirmation
            enrolment={enrolmentData as Enrolment}
            onClose={() => onSuccess?.(enrolmentData as Enrolment)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Step 1: Person identification
 * Identify if new or returning customer
 */
function StepPerson({
  data,
  onNext,
  onCancel,
}: {
  data: Partial<Enrolment>;
  onNext: (data?: Partial<Enrolment>) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('enrolment.person_desc') || 'Identify the person enrolling in the class'}
      </p>
      
      <div className="space-y-3">
        <button
          onClick={() => onNext({ ...data })}
          className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition"
        >
          {t('enrolment.person_returning') || 'Returning customer'}
        </button>
        <button
          onClick={() => onNext({ ...data })}
          className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition"
        >
          {t('enrolment.person_new') || 'New customer'}
        </button>
      </div>

      <button
        onClick={onCancel}
        className="w-full px-4 py-2 text-gray-600 hover:text-gray-800"
      >
        {t('common.cancel') || 'Cancel'}
      </button>
    </div>
  );
}

/**
 * Step 2: Class selection
 */
function StepClass({
  data,
  onNext,
  onPrevious,
}: {
  data: Partial<Enrolment>;
  onNext: (data?: Partial<Enrolment>) => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('enrolment.class_desc') || 'Select the class and term'}
      </p>
      
      {/* Placeholder: Class list will be fetched from useAvailableClasses hook */}
      <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-600">
        {t('enrolment.class_loading') || 'Classes loading...'}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onPrevious}
          className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          {t('common.back') || 'Back'}
        </button>
        <button
          onClick={() => onNext(data)}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t('common.next') || 'Next'}
        </button>
      </div>
    </div>
  );
}

/**
 * Step 3: WhatsApp notification opt-in (NEW in Phase 1D)
 */
function StepNotification({
  onNext,
  onPrevious,
  onSkip,
}: {
  onNext: (data?: Partial<Enrolment>) => void;
  onPrevious: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [useWhatsApp, setUseWhatsApp] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('enrolment.notification_desc') || 'Set up how you want to receive updates'}
      </p>

      <div className="space-y-4">
        {useWhatsApp ? (
          <div className="max-w-sm mx-auto">
            <WhatsAppOtpVerifier
              onVerificationSuccess={() => {
                onNext();
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setUseWhatsApp(true)}
              className="w-full p-4 border-2 border-green-600 rounded-lg hover:bg-green-50 transition text-center"
            >
              <div className="font-semibold">💬 WhatsApp</div>
              <div className="text-sm text-gray-600 mt-1">
                {t('enrolment.notification_whatsapp') || 'Get updates via WhatsApp'}
              </div>
            </button>
            <button
              onClick={() => onNext()}
              className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition text-center"
            >
              <div className="font-semibold">✉️ Email Only</div>
              <div className="text-sm text-gray-600 mt-1">
                {t('enrolment.notification_email') || 'Continue with email only'}
              </div>
            </button>
          </div>
        )}
      </div>

      {!useWhatsApp && (
        <div className="flex gap-2">
          <button
            onClick={onPrevious}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            {t('common.back') || 'Back'}
          </button>
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('common.next') || 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Step 4: Payment/Checkout
 */
function StepCheckout({
  enrolmentData,
  onSubmit,
  onPrevious,
  isLoading,
}: {
  enrolmentData: Partial<Enrolment>;
  onSubmit: () => void;
  onPrevious: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  // TODO: Use enrolmentData to display summary in payment form (Step 4 implementation)
  void enrolmentData; // Intentionally unused for now - will display payment summary

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('enrolment.checkout_desc') || 'Review and complete payment'}
      </p>

      {/* Placeholder: Payment form will use Stripe Payment Element */}
      <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-600">
        {t('enrolment.payment_placeholder') || 'Stripe Payment Element placeholder'}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onPrevious}
          disabled={isLoading}
          className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {t('common.back') || 'Back'}
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : t('common.complete')}
        </button>
      </div>
    </div>
  );
}

/**
 * Step 5: Confirmation
 */
function StepConfirmation({
  enrolment,
  onClose,
}: {
  enrolment: Enrolment;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h3 className="text-lg font-semibold">
        {t('enrolment.confirmation_title') || 'Enrolment Successful!'}
      </h3>
      <p className="text-gray-600">
        {t('enrolment.confirmation_desc') || 'Your enrolment has been confirmed. Confirmation email sent.'}
      </p>

      <div className="p-4 bg-blue-50 rounded-lg text-sm space-y-2">
        <p>
          <strong>{t('enrolment.class')}:</strong> {enrolment.class_id}
        </p>
        <p>
          <strong>{t('enrolment.status')}:</strong> {enrolment.status}
        </p>
        <p>
          <strong>{t('enrolment.date')}:</strong> {new Date(enrolment.created_at).toLocaleDateString()}
        </p>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {t('common.done') || 'Done'}
      </button>
    </div>
  );
}
