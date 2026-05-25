import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { WhatsAppOtpVerifier } from '@/components/shared';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import { useEnrolment } from '../hooks/useEnrolment';
import { useTenant } from '@/hooks/useTenant';
import { EnrolmentService } from '../service';
import {
  EnrolmentOnboardingService,
  type NewMinorOnboardingInput,
  type NewAdultOnboardingInput,
} from '../onboardingService';
import type { Enrolment } from '@shared/schemas';

export type EnrolmentStep = 'person' | 'class' | 'notification' | 'checkout' | 'confirmation';

export interface EnrolmentStepperProps {
  /**
   * Pre-selected class from the classes page (skips class selection step)
   */
  initialClassId?: string;

  /**
   * Term for the pre-selected class (required with initialClassId)
   */
  initialTermId?: string;

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
  initialClassId,
  initialTermId,
  initialStep = 'person',
  skipNotificationStep = false,
  onSuccess,
  onCancel,
}: EnrolmentStepperProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<EnrolmentStep>(initialStep);
  const [enrolmentData, setEnrolmentData] = useState<Partial<Enrolment>>(() => ({
    ...(initialClassId ? { class_id: initialClassId } : {}),
    ...(initialTermId ? { term_id: initialTermId } : {}),
  }));
  
  const tenant = useTenant();
  const { createEnrolment, isCreating } = useEnrolment();
  const [checkoutEnrolmentId, setCheckoutEnrolmentId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const classPreselected = Boolean(initialClassId && initialTermId);

  const steps: EnrolmentStep[] = [
    'person',
    classPreselected ? undefined : 'class',
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

  useEffect(() => {
    if (currentStep !== 'checkout') return;
    if (checkoutEnrolmentId) return;
    if (!tenant || !enrolmentData.person_id || !enrolmentData.class_id || !enrolmentData.term_id) {
      return;
    }

    createEnrolment(
      { ...enrolmentData, status: 'pending_payment' },
      {
        onSuccess: (created) => {
          setCheckoutEnrolmentId(created.id);
          setEnrolmentData(created);
        },
        onError: () => {
          setCheckoutError(t('enrolment.checkout_prepare_failed'));
        },
      },
    );
  }, [
    currentStep,
    checkoutEnrolmentId,
    tenant,
    enrolmentData,
    createEnrolment,
    t,
  ]);

  const handlePaymentSuccess = async () => {
    if (!checkoutEnrolmentId || !tenant) return;

    const poll = async (attempts = 10): Promise<Enrolment | null> => {
      const enrolment = await EnrolmentService.get(
        {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          language: tenant.language_default,
          country: tenant.country,
          currency: tenant.currency,
          vat_rate: tenant.vat_rate,
        },
        checkoutEnrolmentId,
      );
      if (enrolment.status === 'active') return enrolment;
      if (attempts <= 0) return enrolment;
      await new Promise((r) => setTimeout(r, 1500));
      return poll(attempts - 1);
    };

    try {
      const enrolment = await poll();
      setCurrentStep('confirmation');
      if (enrolment) {
        setEnrolmentData(enrolment);
        onSuccess?.(enrolment);
      }
    } catch (error) {
      console.error('Failed to confirm enrolment after payment:', error);
      setCheckoutError(t('enrolment.payment_confirm_pending'));
    }
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
            checkoutEnrolmentId={checkoutEnrolmentId}
            checkoutError={checkoutError}
            isPreparing={isCreating && !checkoutEnrolmentId}
            onPaymentSuccess={handlePaymentSuccess}
            onPrevious={handlePreviousStep}
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

type PersonMode = 'choose' | 'returning' | 'new_minor' | 'new_adult';

/**
 * Step 1: Person identification
 *
 * - Returning: look up existing person by email.
 * - New minor: collect guardian + student details, creates family+person+member.
 * - New adult solo: collect student details, creates person only.
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
  const tenant = useTenant();
  const [mode, setMode] = useState<PersonMode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Returning customer — email lookup
  const [email, setEmail] = useState('');

  // New minor fields
  const [minorFields, setMinorFields] = useState<Partial<NewMinorOnboardingInput>>({
    guardian_role: 'parent',
  });

  // New adult fields
  const [adultFields, setAdultFields] = useState<Partial<NewAdultOnboardingInput>>({});

  const handleReturning = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenant || !email.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const person = await EnrolmentOnboardingService.findPersonByEmail(tenant, email.trim());
      if (!person) {
        setError(t('pages.enrolment.returning_not_found'));
        return;
      }
      onNext({ ...data, person_id: person.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewMinor = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { person } = await EnrolmentOnboardingService.createMinorWithFamily(
        tenant,
        minorFields as NewMinorOnboardingInput
      );
      onNext({ ...data, person_id: person.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewAdult = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { person } = await EnrolmentOnboardingService.createAdultSolo(
        tenant,
        adultFields as NewAdultOnboardingInput
      );
      onNext({ ...data, person_id: person.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'choose') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.enrolment.person_desc')}</p>
        <div className="space-y-3">
          <Button
            onClick={() => setMode('returning')}
            variant="outline"
            className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition"
          >
            {t('pages.enrolment.person_returning')}
          </Button>
          <Button
            onClick={() => setMode('new_minor')}
            variant="outline"
            className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition"
          >
            {t('pages.enrolment.person_new_minor')}
          </Button>
          <Button
            onClick={() => setMode('new_adult')}
            variant="outline"
            className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition"
          >
            {t('pages.enrolment.person_new_adult')}
          </Button>
        </div>
        <Button onClick={onCancel} variant="ghost" className="w-full">
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  if (mode === 'returning') {
    return (
      <form onSubmit={handleReturning} className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.enrolment.returning_desc')}</p>
        <div>
          <label htmlFor="returning-email" className="block text-sm font-medium mb-1">
            {t('form.person.email')} *
          </label>
          <input
            id="returning-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-input w-full"
            placeholder="guardian@example.com"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setMode('choose')} className="flex-1">
            {t('common.back')}
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  if (mode === 'new_minor') {
    return (
      <form onSubmit={handleNewMinor} className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.enrolment.new_minor_desc')}</p>

        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
          <div>
            <label className="block text-sm font-medium mb-1">{t('form.person.name')} *</label>
            <input
              type="text"
              required
              className="form-input w-full"
              value={minorFields.student_name ?? ''}
              onChange={(e) => setMinorFields({ ...minorFields, student_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('form.person.date_of_birth')} *</label>
            <input
              type="date"
              required
              className="form-input w-full"
              value={minorFields.student_date_of_birth ?? ''}
              onChange={(e) => setMinorFields({ ...minorFields, student_date_of_birth: e.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.guardian_section')}</legend>
          <div>
            <label className="block text-sm font-medium mb-1">{t('form.person.name')} *</label>
            <input
              type="text"
              required
              className="form-input w-full"
              value={minorFields.guardian_name ?? ''}
              onChange={(e) => setMinorFields({ ...minorFields, guardian_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('form.person.email')}</label>
            <input
              type="email"
              className="form-input w-full"
              value={minorFields.guardian_email ?? ''}
              onChange={(e) => setMinorFields({ ...minorFields, guardian_email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('form.person.phone')}</label>
            <input
              type="tel"
              className="form-input w-full"
              value={minorFields.guardian_phone ?? ''}
              onChange={(e) => setMinorFields({ ...minorFields, guardian_phone: e.target.value })}
            />
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setMode('choose')} className="flex-1">
            {t('common.back')}
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  // new_adult
  return (
    <form onSubmit={handleNewAdult} className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.new_adult_desc')}</p>
      <div>
        <label className="block text-sm font-medium mb-1">{t('form.person.name')} *</label>
        <input
          type="text"
          required
          className="form-input w-full"
          value={adultFields.name ?? ''}
          onChange={(e) => setAdultFields({ ...adultFields, name: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('form.person.email')}</label>
        <input
          type="email"
          className="form-input w-full"
          value={adultFields.email ?? ''}
          onChange={(e) => setAdultFields({ ...adultFields, email: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('form.person.date_of_birth')}</label>
        <input
          type="date"
          className="form-input w-full"
          value={adultFields.date_of_birth ?? ''}
          onChange={(e) => setAdultFields({ ...adultFields, date_of_birth: e.target.value })}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setMode('choose')} className="flex-1">
          {t('common.back')}
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? t('common.loading') : t('common.next')}
        </Button>
      </div>
    </form>
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
        {t('pages.enrolment.class_desc')}
      </p>
      
      {/* Placeholder: Class list will be fetched from useAvailableClasses hook */}
      <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-600">
        {t('pages.enrolment.class_loading')}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={onPrevious}
          variant="outline"
          className="flex-1"
        >
          {t('common.back') || 'Back'}
        </Button>
        <Button
          type="button"
          onClick={() => onNext(data)}
          variant="primary"
          className="flex-1"
        >
          {t('common.next') || 'Next'}
        </Button>
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
        {t('pages.enrolment.notification_desc')}
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
            <Button
              type="button"
              onClick={() => setUseWhatsApp(true)}
              variant="outline"
              className="w-full p-4 border-2 border-green-600 rounded-lg hover:bg-green-50 transition text-center"
            >
              <div className="font-semibold">💬 WhatsApp</div>
              <div className="text-sm text-gray-600 mt-1">
                {t('pages.enrolment.notification_whatsapp')}
              </div>
            </Button>
            <Button
              type="button"
              onClick={() => onNext()}
              variant="outline"
              className="w-full p-4 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition text-center"
            >
              <div className="font-semibold">✉️ Email Only</div>
              <div className="text-sm text-gray-600 mt-1">
                {t('pages.enrolment.notification_email')}
              </div>
            </Button>
          </div>
        )}
      </div>

      {!useWhatsApp && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onPrevious}
            variant="outline"
            className="flex-1"
          >
            {t('common.back') || 'Back'}
          </Button>
          <Button
            type="button"
            onClick={onSkip}
            variant="primary"
            className="flex-1"
          >
            {t('common.next') || 'Next'}
          </Button>
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
  checkoutEnrolmentId,
  checkoutError,
  isPreparing,
  onPaymentSuccess,
  onPrevious,
}: {
  enrolmentData: Partial<Enrolment>;
  checkoutEnrolmentId: string | null;
  checkoutError: string | null;
  isPreparing: boolean;
  onPaymentSuccess: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();

  if (!enrolmentData.class_id || !enrolmentData.term_id) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('enrolment.missing_class_or_term')}
      </p>
    );
  }

  if (checkoutError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {checkoutError}
      </p>
    );
  }

  if (isPreparing || !checkoutEnrolmentId) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.checkout_desc')}</p>
      <EnrolmentPaymentForm
        classId={enrolmentData.class_id}
        enrolmentId={checkoutEnrolmentId}
        onPaid={onPaymentSuccess}
        onPrevious={onPrevious}
      />
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
        {t('pages.enrolment.confirmation_title')}
      </h3>
      <p className="text-gray-600">
        {t('pages.enrolment.confirmation_desc')}
      </p>

      <div className="p-4 bg-blue-50 rounded-lg text-sm space-y-2">
        <p>
          <strong>{t('pages.enrolment.class_label')}:</strong> {enrolment.class_id}
        </p>
        <p>
          <strong>{t('pages.enrolment.status_label')}:</strong> {enrolment.status}
        </p>
        <p>
          <strong>{t('pages.enrolment.date_label')}:</strong> {new Date(enrolment.created_at).toLocaleDateString()}
        </p>
      </div>

      <Button
        type="button"
        onClick={onClose}
        variant="primary"
        className="w-full"
      >
        {t('common.done') || 'Done'}
      </Button>
    </div>
  );
}
