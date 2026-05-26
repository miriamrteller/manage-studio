import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import { EnrolmentService } from '../service';
import { AdminEnrolmentService, buildPaymentLink, type OfflinePaymentMethod } from '../lib/adminEnrolmentService';
import { computeClassTotal } from '../lib/computeClassTotal';
import { filterClassesByAge, formatLevelWithAge, ageAt } from '../lib/check-requirements';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import type { Class } from '@shared/schemas';

type AdminEnrolStep = 'class' | 'payment' | 'pay_now' | 'done';

export type AdminPaymentChoice = 'pay_now' | 'send_link' | 'offline';

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
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<AdminPaymentChoice | null>(null);
  const [offlineMethod, setOfflineMethod] = useState<OfflinePaymentMethod>('cash');
  const [linkEmail, setLinkEmail] = useState(guardianEmail ?? '');
  const [enrolmentId, setEnrolmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const { classes, isLoading: classesLoading, error: classesError } = useClasses({
    publicOnly: false,
  });
  const { levels } = useLevels();

  const levelNameById = useMemo(
    () => new Map(levels.map((l) => [l.id, l.name])),
    [levels],
  );

  const person = useMemo(
    () => ({ date_of_birth: personDateOfBirth }),
    [personDateOfBirth],
  );

  const studentAge = useMemo(() => {
    if (!personDateOfBirth) return null;
    const age = ageAt(personDateOfBirth);
    return Number.isNaN(age) ? null : age;
  }, [personDateOfBirth]);

  const { classes: availableClasses, ageFilteringActive } = useMemo(
    () => filterClassesByAge(classes, person),
    [classes, person],
  );

  const pricing = useMemo(() => {
    if (!tenant || !selectedClass) return null;
    return computeClassTotal(selectedClass, tenant);
  }, [tenant, selectedClass]);

  useEffect(() => {
    if (isOpen) {
      setStep('class');
      setSelectedClass(null);
      setPaymentChoice(null);
      setOfflineMethod('cash');
      setLinkEmail(guardianEmail ?? '');
      setEnrolmentId(null);
      setError(null);
      setIsSubmitting(false);
      setDoneMessage(null);
    }
  }, [isOpen, guardianEmail]);

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
      class_id: selectedClass.id,
      term_id: selectedClass.term_id,
      status: 'pending_payment',
    });

    return created.id;
  };

  const handleClassNext = () => {
    if (!selectedClass) return;
    setStep('payment');
  };

  const handlePaymentChoice = async (choice: AdminPaymentChoice) => {
    if (!tenant || !selectedClass || !pricing) return;

    setPaymentChoice(choice);
    setError(null);
    setIsSubmitting(true);

    try {
      const id = enrolmentId ?? (await createPendingEnrolment());
      setEnrolmentId(id);

      if (choice === 'pay_now') {
        setStep('pay_now');
        return;
      }

      if (choice === 'send_link') {
        const email = linkEmail.trim();
        if (!email) {
          setError(t('pages.admin_enrol.email_required'));
          return;
        }

        await AdminEnrolmentService.sendPaymentLinkEmail(tenant, {
          recipientEmail: email,
          recipientName: guardianName ?? personName,
          studentName: personName,
          className: selectedClass.name,
          enrolmentId: id,
          totalMinor: pricing.totalMinor,
          currency: pricing.currency,
        });

        setDoneMessage(t('pages.admin_enrol.link_sent', { email }));
        setStep('done');
        await invalidateStudentCaches();
        onSuccess?.();
        return;
      }

      if (choice === 'offline') {
        await AdminEnrolmentService.recordOfflinePayment(
          tenant,
          id,
          selectedClass,
          personId,
          familyId ?? null,
          offlineMethod,
        );

        setDoneMessage(t('pages.admin_enrol.offline_recorded'));
        setStep('done');
        await invalidateStudentCaches();
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setDoneMessage(t('pages.admin_enrol.payment_success'));
    setStep('done');
    await invalidateStudentCaches();
    onSuccess?.();
  };

  const handleClose = () => {
    onClose();
  };

  const title =
    step === 'done'
      ? t('pages.admin_enrol.done_title')
      : t('pages.admin_enrol.title', { name: personName });

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={handleClose}
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
                const levelName = cls.level_id ? levelNameById.get(cls.level_id) : null;
                const ageLabel = formatLevelWithAge(levelName, cls.min_age, cls.max_age);

                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelectedClass(cls as Class)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium">{cls.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[levelName, ageLabel, formatTime(cls.start_time)].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-sm font-medium mt-1">
                        {formatCurrency(cls.price_minor, tenant?.currency ?? 'ILS', i18n.language)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!selectedClass}
              onClick={handleClassNext}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {step === 'payment' && selectedClass && pricing && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium">{selectedClass.name}</p>
            <p className="text-gray-600 mt-1">
              {t('pages.admin_enrol.amount_due')}:{' '}
              {formatCurrency(pricing.totalMinor, pricing.currency, i18n.language)}
            </p>
          </div>

          <p className="text-sm text-gray-600">{t('pages.admin_enrol.payment_desc')}</p>

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start p-4 h-auto"
              disabled={isSubmitting}
              onClick={() => void handlePaymentChoice('pay_now')}
            >
              <div>
                <p className="font-semibold">{t('pages.admin_enrol.pay_now_title')}</p>
                <p className="text-sm text-gray-500">{t('pages.admin_enrol.pay_now_desc')}</p>
              </div>
            </Button>

            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div>
                <p className="font-semibold">{t('pages.admin_enrol.send_link_title')}</p>
                <p className="text-sm text-gray-500">{t('pages.admin_enrol.send_link_desc')}</p>
              </div>
              <label className="block text-sm font-medium" htmlFor="payment-link-email">
                {t('pages.admin_enrol.recipient_email')}
              </label>
              <input
                id="payment-link-email"
                type="email"
                className="form-input w-full"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder={t('pages.admin_enrol.recipient_email_placeholder')}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={isSubmitting || !linkEmail.trim()}
                onClick={() => void handlePaymentChoice('send_link')}
              >
                {t('pages.admin_enrol.send_link_action')}
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div>
                <p className="font-semibold">{t('pages.admin_enrol.offline_title')}</p>
                <p className="text-sm text-gray-500">{t('pages.admin_enrol.offline_desc')}</p>
              </div>
              <label className="block text-sm font-medium" htmlFor="offline-method">
                {t('pages.admin_enrol.offline_method')}
              </label>
              <select
                id="offline-method"
                className="form-input w-full"
                value={offlineMethod}
                onChange={(e) => setOfflineMethod(e.target.value as OfflinePaymentMethod)}
              >
                <option value="cash">{t('pages.admin_enrol.method_cash')}</option>
                <option value="check">{t('pages.admin_enrol.method_check')}</option>
                <option value="bank_transfer">{t('pages.admin_enrol.method_bank')}</option>
              </select>
              <Button
                variant="outline"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => void handlePaymentChoice('offline')}
              >
                {t('pages.admin_enrol.offline_action')}
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button variant="outline" className="w-full" onClick={() => setStep('class')}>
            {t('common.back')}
          </Button>
        </div>
      )}

      {step === 'pay_now' && selectedClass && enrolmentId && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('pages.admin_enrol.pay_now_inline')}</p>
          <EnrolmentPaymentForm
            classId={selectedClass.id}
            enrolmentId={enrolmentId}
            onPaid={() => void handlePaymentSuccess()}
            onPrevious={() => setStep('payment')}
          />
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{doneMessage}</p>
          {paymentChoice === 'send_link' && enrolmentId && (
            <p className="text-xs text-gray-500 break-all">
              {t('pages.admin_enrol.link_copy')}: {buildPaymentLink(enrolmentId)}
            </p>
          )}
          <Button variant="primary" className="w-full" onClick={handleClose}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
