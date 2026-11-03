import type { TFunction } from 'i18next';
import type { TenantConfig } from '@/types/auth';
import type { Engagement } from '@shared/schemas';
import {
  EnrolmentOnboardingService,
  type NewAdultOnboardingInput,
  type NewMinorOnboardingInput,
} from '../onboardingService';
import { EnrolmentIntakeService } from '../intakeService';
import type { EnrolmentContextValue } from './useEnrolmentContext';

/**
 * Creating a new student from the "who is enrolling" step (child, adult, or
 * child plus guardian), then moving on with the new person.
 */
export function useEnrolmentPersonCreation({
  tenant,
  enrolmentContext,
  enrolmentData,
  handlePersonNext,
  setGuestGuardianEmail,
  t,
}: {
  tenant: TenantConfig | null;
  enrolmentContext: EnrolmentContextValue;
  enrolmentData: Partial<Engagement>;
  handlePersonNext: (newData?: Partial<Engagement>, dob?: string | null) => void;
  setGuestGuardianEmail: (email: string | null) => void;
  t: TFunction;
}) {
  const onCreateMinor = async (fields: { student_name: string; student_date_of_birth: string }) => {
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
  };

  const onCreateAdult = async (fields: {
    name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
  }) => {
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
  };

  const onCreateMinorWithGuardian = async (fields: {
    student_name: string;
    student_date_of_birth: string;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    existing_account_id?: string;
  }) => {
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
  };

  return { onCreateMinor, onCreateAdult, onCreateMinorWithGuardian };
}
