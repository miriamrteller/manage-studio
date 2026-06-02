import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EnrolmentService } from '../service';
import { buildPaymentLink } from '../lib/adminEnrolmentService';
import { filterClassesByAge, ageAt, buildSeasonStartById } from '../lib/check-requirements';
import {
  AdminEnrolmentPaymentStep,
  type AdminPaymentChoice,
} from './AdminEnrolmentPaymentStep';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTerms } from '@/features/terms/hooks/useTerms';
import { parseLocalDate } from '@/lib/personAge';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { computeClassTotal } from '../lib/computeClassTotal';
import type { Offering } from '@shared/schemas';

type AdminEnrolStep = 'class' | 'payment' | 'done';

export type { AdminPaymentChoice };

interface AdminEnrolStudentModalProps {
  personId: string;
  personName: string;
  personDateOfBirth?: string | null;
  familyId?: string | null;
  guardianEmail?: string | null;
  guardianName?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

/**
 * AdminEnrolStudentModal: Enrol an existing student in a class from the admin UI.
 * Supports pay-now (Stripe), send payment link by email, or record offline payment.
 */
export function AdminEnrolStudentModal({
  personId,
  personName,
  personDateOfBirth,
  familyId,
  guardianEmail,
  guardianName,
  isOpen,
  onClose,
  onSuccess,
}: AdminEnrolStudentModalProps) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<AdminEnrolStep>('class');
  const [selectedClass, setSelectedClass] = useState<Offering | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<AdminPaymentChoice | null>(null);
  const [engagementId, setEnrolmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const { classes, isLoading: classesLoading, error: classesError } = useClasses({
    publicOnly: false,
  });
  const { terms } = useTerms({ page: 1 });
  const { levels } = useLevels();

  const levelNameById = useMemo(
    () => new Map(levels.map((l) => [l.id, l.name])),
    [levels],
  );

  const seasonStartById = useMemo(() => buildSeasonStartById(terms), [terms]);

  const person = useMemo(
    () => ({ date_of_birth: personDateOfBirth }),
    [personDateOfBirth],
  );

  const ageCheckOptions = useMemo(
    () => ({ seasonStartById }),
    [seasonStartById],
  );

  const displaySeasonStart = useMemo(() => {
    const fromClass = classes.find((c) => c.season_start_date)?.season_start_date;
    if (fromClass) return fromClass;
    const seasonId = classes.find((c) => c.season_id)?.season_id;
    return seasonId ? seasonStartById[seasonId] : undefined;
  }, [classes, seasonStartById]);

  const studentAge = useMemo(() => {
    if (!personDateOfBirth || !displaySeasonStart) return null;
    const age = ageAt(personDateOfBirth, parseLocalDate(displaySeasonStart));
    return Number.isNaN(age) ? null : age;
  }, [personDateOfBirth, displaySeasonStart]);

  const { classes: availableClasses, ageFilteringActive } = useMemo(
    () => filterClassesByAge(classes, person, ageCheckOptions),
    [classes, person, ageCheckOptions],
  );

  useEffect(() => {
    if (isOpen) {
      setStep('class');
      setSelectedClass(null);
      setPaymentChoice(null);
      setEnrolmentId(null);
      setError(null);
      setIsSubmitting(false);
      setDoneMessage(null);
    }
  }, [isOpen]);

  const invalidateStudentCaches = async () => {
    if (!tenant) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['student-detail-enrolments', tenant.id, personId] }),
      queryClient.invalidateQueries({ queryKey: ['students-list-enrolments', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['enrolments', tenant.id] }),
    ]);
  };

  const createPendingEnrolment = async (): Promise<string> => {
    if (!tenant || !selectedClass) {
      throw new Error('Missing tenant or class');
    }

    const created = await EnrolmentService.create(tenant, {
      person_id: personId,
      offering_id: selectedClass.id,
      season_id: selectedClass.season_id,
      status: 'pending_payment',
    });

    return created.id;
  };

  const handleClassNext = async () => {
    if (!selectedClass || !tenant) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const id = await createPendingEnrolment();
      setEnrolmentId(id);
      setStep('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentComplete = async (result: {
    message: string;
    paymentChoice: AdminPaymentChoice;
  }) => {
    setPaymentChoice(result.paymentChoice);
    setDoneMessage(result.message);
    setStep('done');
    await invalidateStudentCaches();
    onSuccess?.();
  };

  const title =
    step === 'done'
      ? t('pages.admin_enrol.done_title')
      : t('pages.admin_enrol.title', { name: personName });

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      className="max-w-2xl w-full"
    >
      {step === 'class' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('pages.admin_enrol.class_desc')}</p>

          {studentAge != null && ageFilteringActive && (
            <p className="text-sm text-gray-700" role="status">
              {t('pages.enrolment.showing_for_age', { age: studentAge })}
            </p>
          )}

          {classesLoading && (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          )}

          {classesError && (
            <p className="text-sm text-destructive" role="alert">
              {classesError}
            </p>
          )}

          {!classesLoading && availableClasses.length === 0 && (
            <p className="text-sm text-gray-500">{t('pages.enrolment.no_classes')}</p>
          )}

          {!classesLoading && availableClasses.length > 0 && (
            <ul className="space-y-2 max-h-64 overflow-y-auto" role="listbox">
              {availableClasses.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                const levelName = cls.category_id ? levelNameById.get(cls.category_id) : null;
                const detailParts = [
                  levelName && levelName !== cls.name ? levelName : null,
                  formatTime(cls.start_time),
                ].filter(Boolean);

                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelectedClass(cls as Offering)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium">{cls.name}</p>
                      {detailParts.length > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">{detailParts.join(' · ')}</p>
                      )}
                      <p className="text-sm font-medium mt-1">
                        {tenant &&
                          formatCurrency(
                            computeClassTotal(cls, tenant).chargeMinor,
                            tenant.currency ?? 'ILS',
                            i18n.language,
                          )}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!selectedClass || isSubmitting}
              onClick={() => void handleClassNext()}
            >
              {isSubmitting ? t('common.loading') : t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {step === 'payment' && selectedClass && engagementId && tenant && (
        <AdminEnrolmentPaymentStep
          tenant={tenant}
          engagementId={engagementId}
          personId={personId}
          personName={personName}
          familyId={familyId}
          guardianEmail={guardianEmail}
          guardianName={guardianName}
          classRow={selectedClass}
          emailInputId="modal-payment-link-email"
          offlineMethodId="modal-offline-method"
          onComplete={(result) => void handlePaymentComplete(result)}
          onPrevious={() => setStep('class')}
        />
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{doneMessage}</p>
          {paymentChoice === 'send_link' && engagementId && (
            <p className="text-xs text-gray-500 break-all">
              {t('pages.admin_enrol.link_copy')}: {buildPaymentLink(engagementId)}
            </p>
          )}
          <Button variant="primary" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
