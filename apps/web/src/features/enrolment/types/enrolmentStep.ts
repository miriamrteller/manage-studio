export type EnrolmentStep =
  | 'person'
  | 'class'
  | 'notification'
  | 'verify_email'
  | 'waiver'
  | 'checkout'
  | 'confirmation';

export interface EnrolmentStepperProps {
  /** Pre-selected class from the classes page (skips class selection step) */
  initialClassId?: string;
  /** Term for the pre-selected class (required with initialClassId) */
  initialTermId?: string;
  /** Initial step (default: 'person') */
  initialStep?: EnrolmentStep;
  /** Skip notification step if user already verified */
  skipNotificationStep?: boolean;
  /** Callback when enrolment is successfully created */
  onSuccess?: (enrolment: import('@shared/schemas').Engagement) => void;
  /** Enrollment routing context (class, student, admin mode, family scope) */
  enrollmentIntent?: import('@/lib/enrollment-intent').EnrollmentIntent | null;
  initialResumeState?: import('../lib/enrolmentResumeState').EnrolmentResumeState | null;
  /** Callback when user cancels enrolment */
  onCancel?: () => void;
}
