import { useState, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { TenantConfig } from '@/types/auth';
import type { Engagement } from '@shared/schemas';
import { EnrolmentIntakeService } from '../intakeService';
import { evaluateAgeEnrolment, type AgeEnrolmentActor } from '../lib/ageEnrolmentPolicy';
import { formatAgeRange } from '../lib/check-requirements';
import { mapAgeReviewRpcError } from '../lib/ageReviewService';
import { notifyAdminsAgeReviewSubmitted } from '../lib/sendAgeReviewNotifications';
import type { EnrolmentConstraints, EnrolmentMode } from './useEnrolmentContext';

/**
 * The student is outside the preselected class's ages: ask the studio to
 * review, record the engagement as `admin_review` and tell the admins.
 */
export function useEnrolmentAgeReviewRequest({
  tenant,
  mode,
  constraints,
  initialClassId,
  initialTermId,
  personDateOfBirth,
  enrolmentActor,
  selectedClassName,
  setEnrolmentData,
  setReviewSubmitted,
  t,
}: {
  tenant: TenantConfig | null;
  mode: EnrolmentMode;
  constraints: EnrolmentConstraints;
  initialClassId?: string;
  initialTermId?: string;
  personDateOfBirth: string | null;
  enrolmentActor: AgeEnrolmentActor;
  selectedClassName: string;
  setEnrolmentData: Dispatch<SetStateAction<Partial<Engagement>>>;
  setReviewSubmitted: (value: boolean) => void;
  t: TFunction;
}) {
  const [ageReviewSubmitting, setAgeReviewSubmitting] = useState(false);
  const [ageReviewError, setAgeReviewError] = useState<string | null>(null);

  const handleAgeReviewRequest = async (input: {
    note: string;
    personId: string;
    studentName: string;
  }) => {
    if (!tenant || !initialClassId || !initialTermId) {
      throw new Error(t('pages.enrolment.age_review_error_generic'));
    }

    setAgeReviewSubmitting(true);
    setAgeReviewError(null);

    try {
      const classAges = constraints.ageBand
        ? formatAgeRange(
            constraints.ageBand.min_age,
            constraints.ageBand.max_age,
          )
        : null;
      const studentAge = personDateOfBirth
        ? evaluateAgeEnrolment({
            dateOfBirth: personDateOfBirth,
            ageBand: constraints.ageBand,
            seasonStartDate: constraints.seasonStartDate,
            actor: enrolmentActor,
          }).studentAge
        : null;

      const requestResult =
        mode === 'guest'
          ? await EnrolmentIntakeService.requestGuestAgeReview(tenant, {
              studentPersonId: input.personId,
              offeringId: initialClassId,
              seasonId: initialTermId,
              note: input.note,
            })
          : await EnrolmentIntakeService.requestAgeReview(tenant, {
              personId: input.personId,
              offeringId: initialClassId,
              seasonId: initialTermId,
              note: input.note,
            });

      setEnrolmentData((prev) => ({
        ...prev,
        person_id: input.personId,
        offering_id: initialClassId,
        season_id: initialTermId,
        id: requestResult.engagementId,
        status: 'admin_review',
      }));
      setReviewSubmitted(true);

      await notifyAdminsAgeReviewSubmitted(tenant, {
        engagementId: requestResult.engagementId,
        studentName: input.studentName,
        className: selectedClassName,
        studentAge,
        classAgeRange: classAges,
        parentNote: input.note,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAgeReviewError(t(mapAgeReviewRpcError(message)));
      throw err;
    } finally {
      setAgeReviewSubmitting(false);
    }
  };

  return { handleAgeReviewRequest, ageReviewSubmitting, ageReviewError };
}
