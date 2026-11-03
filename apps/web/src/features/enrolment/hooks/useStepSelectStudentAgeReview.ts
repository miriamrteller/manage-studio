import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { isExistingEmailError, EnrolmentIntakeService } from '../intakeService';
import { EnrolmentOnboardingService } from '../onboardingService';
import { mapAgeReviewRpcError } from '../lib/ageReviewService';
import type { EnrolmentMode } from './useEnrolmentContext';
import type { GuardianAccountLookup, GuardianProfile } from '../onboardingService';
import type { SelectStudentFields } from './useSelectStudentFields';
import type { SelectStudentSubMode } from '../components/select-student/types';

interface UseStepSelectStudentAgeReviewArgs {
  mode: EnrolmentMode;
  subMode: SelectStudentSubMode;
  fields: SelectStudentFields;
  guardian: GuardianProfile | null;
  resolvedLinkedFamily: GuardianAccountLookup | null;
  adultNeedsGuardian: boolean;
  onSubmitAgeReview?: (input: {
    note: string;
    personId: string;
    studentName: string;
  }) => Promise<void>;
  setIsSubmitting: (value: boolean) => void;
  setForceExistingEmailPrompt: (value: boolean) => void;
}

/**
 * Sending an age review request from the "who is enrolling" step: creates the
 * person first (the same way the form would), then asks the studio to review.
 */
export function useStepSelectStudentAgeReview({
  mode,
  subMode,
  fields,
  guardian,
  resolvedLinkedFamily,
  adultNeedsGuardian,
  onSubmitAgeReview,
  setIsSubmitting,
  setForceExistingEmailPrompt,
}: UseStepSelectStudentAgeReviewArgs) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [localAgeReviewError, setLocalAgeReviewError] = useState<string | null>(null);

  const {
    studentName,
    studentDob,
    adultName,
    adultEmail,
    adultPhone,
    adultDob,
    guardianName,
    guardianEmail,
    guardianPhone,
  } = fields;

  const submitAgeReviewRequest = async (note: string) => {
    if (!onSubmitAgeReview || !tenant) return;
    setLocalAgeReviewError(null);
    setIsSubmitting(true);
    try {
      let personId = '';
      let resolvedStudentName = studentName;

      if (subMode === 'new_family') {
        const guardianNameForSubmit = resolvedLinkedFamily?.guardianName ?? guardianName;
        if (mode === 'guest') {
          if (!guardianEmail) throw new Error(t('pages.enrolment.guardian_email_required'));
          const result = await EnrolmentIntakeService.createGuestFamily(tenant, {
            guardian: {
              name: guardianNameForSubmit,
              email: guardianEmail,
              phone: guardianPhone,
            },
            student: { name: studentName, dateOfBirth: studentDob },
          });
          personId = result.studentPersonId;
        } else if (resolvedLinkedFamily?.accountId) {
          const person = await EnrolmentOnboardingService.createChildForAccount(
            tenant,
            resolvedLinkedFamily.accountId,
            {
              student_name: studentName,
              student_date_of_birth: studentDob,
            },
          );
          personId = person.id;
        } else {
          const person = await EnrolmentOnboardingService.createStudentWithGuardianEmail(tenant, {
            student_name: studentName,
            student_date_of_birth: studentDob,
            guardian_name: guardianNameForSubmit,
            guardian_email: guardianEmail || undefined,
            guardian_phone: guardianPhone || undefined,
            guardian_role: 'account_holder',
          });
          personId = person.id;
        }
      } else if (subMode === 'new_adult') {
        resolvedStudentName = adultName;
        if (adultNeedsGuardian) {
          const person = await EnrolmentOnboardingService.createStudentWithGuardianEmail(tenant, {
            student_name: adultName,
            student_date_of_birth: adultDob,
            guardian_name: guardianName,
            guardian_email: guardianEmail || undefined,
            guardian_phone: guardianPhone || undefined,
            guardian_role: 'account_holder',
          });
          personId = person.id;
        } else if (mode === 'guest') {
          if (!adultEmail) throw new Error(t('pages.enrolment.guardian_email_required'));
          const result = await EnrolmentIntakeService.createGuestAdult(tenant, {
            name: adultName,
            email: adultEmail,
            phone: adultPhone,
            dateOfBirth: adultDob,
          });
          personId = result.personId;
        } else {
          const { person } = await EnrolmentOnboardingService.createAdultSolo(tenant, {
            name: adultName,
            email: adultEmail || undefined,
            phone: adultPhone || undefined,
            date_of_birth: adultDob || undefined,
          });
          personId = person.id;
        }
      } else if (subMode === 'new_child') {
        if (!guardian?.accountId) throw new Error(t('pages.enrolment.no_account_linked'));
        const person = await EnrolmentOnboardingService.createChildForAccount(tenant, guardian.accountId, {
          student_name: studentName,
          student_date_of_birth: studentDob,
        });
        personId = person.id;
      } else {
        throw new Error(t('pages.enrolment.age_review_error_generic'));
      }

      await onSubmitAgeReview({ note, personId, studentName: resolvedStudentName });
    } catch (err) {
      if (isExistingEmailError(err)) {
        setForceExistingEmailPrompt(true);
        setLocalAgeReviewError(null);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setLocalAgeReviewError(t(mapAgeReviewRpcError(message)));
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitAgeReviewRequest, localAgeReviewError };
}
