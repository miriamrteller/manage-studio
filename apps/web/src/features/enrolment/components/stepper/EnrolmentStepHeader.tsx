import { useTranslation } from 'react-i18next';
import type { EnrolmentStep } from '../../types/enrolmentStep';

/** Step title, "Step N of M" counter and the progress bar. */
export function EnrolmentStepHeader({
  currentStep,
  currentStepIndex,
  steps,
  stepTitles,
}: {
  currentStep: EnrolmentStep;
  currentStepIndex: number;
  steps: EnrolmentStep[];
  stepTitles: Record<EnrolmentStep, string>;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h2 className="text-xl font-semibold text-gray-900">{stepTitles[currentStep]}</h2>
        <p className="text-sm text-gray-600 mt-2">
          {currentStep === 'person' || currentStep === 'class'
            ? // Whether a health declaration step follows is only known once the class is chosen,
              // so the total is shown from then on and never changes.
              t('enrolment.step_counter_open', { current: currentStepIndex + 1 })
            : t('enrolment.step_counter', { current: currentStepIndex + 1, total: steps.length })}
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
    </>
  );
}
