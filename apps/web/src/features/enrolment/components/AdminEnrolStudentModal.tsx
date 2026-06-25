import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EnrolmentService } from '../service';
import { buildPaymentLink } from '../lib/adminEnrolmentService';
import {
  ageAt,
  formatAgeRange,
  personAgeAtSeasonStart,
} from '../lib/check-requirements';
import { useEnrolmentClassPicker } from '../hooks/useEnrolmentClassPicker';
import { EnrolmentClassSelectList } from './EnrolmentClassSelectList';
import { AgeOverridePanel } from './AgeOverridePanel';
import {
  AdminEnrolmentPaymentStep,
  type AdminPaymentChoice,
} from './AdminEnrolmentPaymentStep';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTerms } from '@/features/terms/hooks/useTerms';
import {
  enrolmentShowingForAgeMessage,
  parseLocalDate,
} from '@/lib/personAge';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { computeClassTotal } from '../lib/computeClassTotal';
import { mapEnrolmentFlowError } from '../lib/mapEnrolmentFlowError';
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
 * Supports pay-now (Stripe), send completion link by email, or record offline payment.
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
  const [completionLink, setCompletionLink] = useState<string | null>(null);
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showFullLink, setShowFullLink] = useState(false);
  const [engagementId, setEnrolmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [ageOverrideConfirmed, setAgeOverrideConfirmed] = useState(false);
  const [ageOverrideReason, setAgeOverrideReason] = useState('');

  const { classes, isLoading: classesLoading, error: classesError } = useClasses({
    publicOnly: false,
  });
  const { terms } = useTerms({ page: 1 });
  const { levels } = useLevels();

  const classPicker = useEnrolmentClassPicker({
    personId,
    personDateOfBirth,
    classes,
    terms,
    allowAgeOverride: true,
    showAllClasses,
  });

  const levelNameById = useMemo(
    () => new Map(levels.map((l) => [l.id, l.name])),
    [levels],
  );

  const displaySeasonStart = useMemo(() => {
    const fromClass = classes.find((c) => c.season_start_date)?.season_start_date;
    if (fromClass) return fromClass;
    const seasonId = classes.find((c) => c.season_id)?.season_id;
    return seasonId ? classPicker.seasonStartById[seasonId] : undefined;
  }, [classes, classPicker.seasonStartById]);

  const studentAge = useMemo(() => {
    if (!personDateOfBirth || !displaySeasonStart) return null;
    const age = ageAt(personDateOfBirth, parseLocalDate(displaySeasonStart));
    return Number.isNaN(age) ? null : age;
  }, [personDateOfBirth, displaySeasonStart]);

  useEffect(() => {
    if (isOpen) {
      setStep('class');
      setSelectedClass(null);
      setPaymentChoice(null);
      setEnrolmentId(null);
      setError(null);
      setIsSubmitting(false);
      setDoneMessage(null);
      setCompletionLink(null);
      setLinkWarning(null);
      setCopyFeedback(null);
      setShowFullLink(false);
      setShowAllClasses(false);
      setAgeOverrideConfirmed(false);
      setAgeOverrideReason('');
    }
  }, [isOpen]);

  const selectedClassEligible = selectedClass ? classPicker.isClassAgeEligible(selectedClass) : true;
  const selectedClassAlreadyEnrolled = selectedClass
    ? classPicker.isClassAlreadyEnrolled(selectedClass)
    : false;

  const { enrolledKeysLoading, isClassAlreadyEnrolled } = classPicker;

  useEffect(() => {
    if (!selectedClass || enrolledKeysLoading) return;
    if (isClassAlreadyEnrolled(selectedClass)) {
      setSelectedClass(null);
    }
  }, [selectedClass, enrolledKeysLoading, isClassAlreadyEnrolled]);
  const selectedClassAges = selectedClass
    ? formatAgeRange(selectedClass.min_age, selectedClass.max_age)
    : null;
  const selectedClassSeasonStart = selectedClass
    ? classPicker.classSeasonStartDate(selectedClass)
    : null;
  const selectedClassStudentAge =
    personDateOfBirth && selectedClassSeasonStart
      ? personAgeAtSeasonStart(personDateOfBirth, selectedClassSeasonStart)
      : null;

  const invalidateStudentCaches = async () => {
    if (!tenant) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['student-detail-enrolments', tenant.id, personId] }),
      queryClient.invalidateQueries({ queryKey: ['students-list-enrolments', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['enrolments', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['person-existing-enrolments', tenant.id, personId] }),
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
      age_override_confirmed: !selectedClassEligible ? ageOverrideConfirmed : undefined,
      age_override_reason: !selectedClassEligible ? ageOverrideReason : undefined,
    });

    return created.id;
  };

  const handleClassNext = async () => {
    if (!selectedClass || !tenant || selectedClassAlreadyEnrolled) return;
    if (!selectedClassEligible && !ageOverrideConfirmed) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const id = await createPendingEnrolment();
      setEnrolmentId(id);
      setStep('payment');
    } catch (err) {
      setError(mapEnrolmentFlowError(err, t, 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentComplete = async (result: {
    message: string;
    paymentChoice: AdminPaymentChoice;
    paymentUrl?: string;
    warning?: string;
  }) => {
    setPaymentChoice(result.paymentChoice);
    setDoneMessage(result.message);
    setCompletionLink(result.paymentUrl ?? null);
    setLinkWarning(result.warning ?? null);
    setStep('done');
    await invalidateStudentCaches();
    onSuccess?.();
  };

  const title =
    step === 'done'
      ? t('pages.admin_enrol.done_title')
      : t('pages.admin_enrol.title', { name: personName });

  const hiddenByAgeCount = classes.length - classPicker.availableClasses.length;

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

          {studentAge != null && classPicker.ageFilteringActive && (
            <p className="text-sm text-gray-700" role="status">
              {enrolmentShowingForAgeMessage(studentAge, t)}
            </p>
          )}

          {classesLoading || classPicker.enrolledKeysLoading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : null}

          {classesError && (
            <p className="text-sm text-destructive" role="alert">
              {classesError}
            </p>
          )}

          {!classesLoading &&
            !classPicker.enrolledKeysLoading &&
            classPicker.displayClasses.length === 0 && (
            <p className="text-sm text-gray-500">{t('pages.enrolment.no_classes')}</p>
          )}

          {hiddenByAgeCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showAllClasses}
                onChange={(e) => setShowAllClasses(e.target.checked)}
              />
              {t('pages.enrolment.show_all_classes')}
            </label>
          )}

          {!classesLoading && !classPicker.enrolledKeysLoading && classPicker.displayClasses.length > 0 && (
            <EnrolmentClassSelectList
              classes={classPicker.displayClasses}
              selectedClassId={selectedClass?.id ?? null}
              onSelectClass={(cls) => {
                setSelectedClass(cls as Offering);
                setError(null);
                setAgeOverrideConfirmed(false);
                setAgeOverrideReason('');
              }}
              getClassAvailability={classPicker.getClassAvailability}
              classSeasonStartDate={classPicker.classSeasonStartDate}
              personDateOfBirth={personDateOfBirth}
              listClassName="space-y-2 max-h-64 overflow-y-auto"
              showAgeMismatchDetail
              renderClassDetails={(cls) => {
                const levelName = cls.category_id ? levelNameById.get(cls.category_id) : null;
                const detailParts = [
                  levelName && levelName !== cls.name ? levelName : null,
                  formatTime(cls.start_time),
                ].filter(Boolean);

                return (
                  <>
                    <p className="font-medium">{cls.name}</p>
                    {detailParts.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{detailParts.join(' · ')}</p>
                    )}
                    {cls.location && (
                      <p className="text-xs text-gray-500 mt-0.5">{cls.location}</p>
                    )}
                    <p className="text-sm font-medium mt-1">
                      {tenant &&
                        formatCurrency(
                          computeClassTotal(cls, tenant).chargeMinor,
                          tenant.currency ?? 'ILS',
                          i18n.language,
                        )}
                    </p>
                  </>
                );
              }}
            />
          )}

          {selectedClass && !selectedClassEligible && (
            <AgeOverridePanel
              studentAge={selectedClassStudentAge}
              classAges={selectedClassAges}
              confirmed={ageOverrideConfirmed}
              reason={ageOverrideReason}
              onConfirmedChange={setAgeOverrideConfirmed}
              onReasonChange={setAgeOverrideReason}
            />
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
              disabled={
                classPicker.enrolledKeysLoading ||
                !selectedClass ||
                selectedClassAlreadyEnrolled ||
                isSubmitting ||
                (!selectedClassEligible && !ageOverrideConfirmed)
              }
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
            <div className="space-y-2">
              {linkWarning && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  {linkWarning}
                </p>
              )}
              <p className="text-xs text-gray-500 break-all">
                {t('pages.admin_enrol.link_copy')}:{' '}
                {(() => {
                  const full = completionLink ?? buildPaymentLink(engagementId);
                  return showFullLink || full.length <= 110
                    ? full
                    : `${full.slice(0, 72)}...${full.slice(-24)}`;
                })()}
              </p>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowFullLink((v) => !v)}
              >
                {showFullLink
                  ? t('common.hide', { defaultValue: 'Hide full link' })
                  : t('common.show', { defaultValue: 'Show full link' })}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(completionLink ?? buildPaymentLink(engagementId));
                    setCopyFeedback(
                      t('pages.admin_enrol.link_copied', {
                        defaultValue: 'Completion link copied to clipboard.',
                      }),
                    );
                  } catch {
                    setCopyFeedback(
                      t('pages.admin_enrol.link_copy_failed', {
                        defaultValue: 'Could not copy automatically. Select and copy the link manually.',
                      }),
                    );
                  }
                }}
              >
                {t('pages.admin_enrol.copy_link_action', { defaultValue: 'Copy completion link' })}
              </Button>
              {copyFeedback && <p className="text-xs text-gray-600">{copyFeedback}</p>}
            </div>
          )}
          <Button variant="primary" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
