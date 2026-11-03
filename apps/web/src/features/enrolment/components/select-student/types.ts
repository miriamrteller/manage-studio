import type { EnrolmentConstraints } from '../../hooks/useEnrolmentContext';
import type { AgeEnrolmentActor } from '../../lib/ageEnrolmentPolicy';

export type SelectStudentSubMode = 'choose' | 'new_child' | 'new_adult' | 'new_family' | 'pick_child';

/** Props every form passes to SelectedClassAgeAlert (only the date of birth and name differ). */
export interface SharedAgeAlertProps {
  constraints: EnrolmentConstraints;
  actor: AgeEnrolmentActor;
  ageOverrideConfirmed: boolean;
  className: string;
  onSubmitAgeReview?: (note: string) => Promise<void>;
  onBrowseClasses?: () => void;
  ageReviewSubmitting: boolean;
  ageReviewError: string | null;
}

/** Submit state shared by the step's forms. */
export interface SelectStudentFormState {
  error: string | null;
  setError: (value: string | null) => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  setForceExistingEmailPrompt: (value: boolean) => void;
}
