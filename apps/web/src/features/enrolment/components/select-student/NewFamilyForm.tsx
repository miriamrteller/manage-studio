import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { isExistingEmailError } from '../../intakeService';
import { SelectedClassAgeAlert } from '../../lib/selectedClassAgeValidation';
import type { EnrolmentMode } from '../../hooks/useEnrolmentContext';
import type { GuardianAccountLookup } from '../../onboardingService';
import type { SelectStudentFields } from '../../hooks/useSelectStudentFields';
import { GuestExistingAccountPrompt } from '../GuestExistingAccountPrompt';
import type { SelectStudentFormState, SharedAgeAlertProps } from './types';

/** New child plus their guardian (or a new child in a family the admin already found). */
export function NewFamilyForm({
  mode,
  fields,
  formState,
  ageAlert,
  studentDobBlocked,
  showGuardianExistingPrompt,
  showAdminExistingFamily,
  resolvedLinkedFamily,
  adminLookupChecking,
  guardianEmailChecking,
  onUnlinkFamily,
  onCreateMinorWithGuardian,
  onBack,
  onCancel,
  onSignInRequest,
}: {
  mode: EnrolmentMode;
  fields: SelectStudentFields;
  formState: SelectStudentFormState;
  ageAlert: SharedAgeAlertProps;
  studentDobBlocked: boolean;
  showGuardianExistingPrompt: boolean;
  showAdminExistingFamily: boolean;
  resolvedLinkedFamily: GuardianAccountLookup | null;
  adminLookupChecking: boolean;
  guardianEmailChecking: boolean;
  onUnlinkFamily: () => void;
  onCreateMinorWithGuardian: (fields: {
    student_name: string;
    student_date_of_birth: string;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    existing_account_id?: string;
  }) => Promise<void>;
  onBack: () => void;
  onCancel?: () => void;
  onSignInRequest?: () => void;
}) {
  const { t } = useTranslation();
  const {
    studentName,
    setStudentName,
    studentDob,
    setStudentDob,
    guardianName,
    setGuardianName,
    guardianEmail,
    setGuardianEmail,
    guardianPhone,
    setGuardianPhone,
  } = fields;
  const { error, setError, isSubmitting, setIsSubmitting, setForceExistingEmailPrompt } = formState;

  const clearLinkedFamily = () => {
    onUnlinkFamily();
    setGuardianEmail('');
    setGuardianName('');
    setGuardianPhone('');
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setForceExistingEmailPrompt(false);
        if (showGuardianExistingPrompt) return;
        if (studentDobBlocked) return;
        setIsSubmitting(true);
        try {
          const guardianNameForSubmit =
            resolvedLinkedFamily?.guardianName ?? guardianName;
          await onCreateMinorWithGuardian({
            student_name: studentName,
            student_date_of_birth: studentDob,
            guardian_name: guardianNameForSubmit,
            guardian_email: guardianEmail || undefined,
            guardian_phone: showAdminExistingFamily ? undefined : guardianPhone || undefined,
            existing_account_id: resolvedLinkedFamily?.accountId,
          });
        } catch (err) {
          if (isExistingEmailError(err)) {
            setForceExistingEmailPrompt(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : t('common.error'));
          }
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="text-sm text-gray-600">
        {mode === 'guest'
          ? t('pages.enrolment.guest_new_family_desc')
          : showAdminExistingFamily
            ? t('pages.enrolment.admin_add_child_desc')
            : t('pages.enrolment.new_minor_desc')}
      </p>

      {showAdminExistingFamily && resolvedLinkedFamily ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-2">
          <p className="font-medium">{t('pages.enrolment.linked_family')}</p>
          <p>{resolvedLinkedFamily.guardianName}</p>
          {(resolvedLinkedFamily.guardianEmail ?? guardianEmail) && (
            <p>{resolvedLinkedFamily.guardianEmail ?? guardianEmail}</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={clearLinkedFamily}>
            {t('pages.enrolment.change_family')}
          </Button>
        </div>
      ) : (
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.guardian_section')}</legend>
          {mode === 'admin' && (
            <input
              type="email"
              required
              className="form-input w-full"
              value={guardianEmail}
              onChange={(e) => {
                setGuardianEmail(e.target.value);
                setForceExistingEmailPrompt(false);
                onUnlinkFamily();
              }}
              placeholder={t('form.person.email')}
            />
          )}
          {mode === 'admin' && adminLookupChecking && (
            <p className="text-sm text-gray-500" role="status">
              {t('common.loading')}
            </p>
          )}
          {mode === 'admin' &&
            !adminLookupChecking &&
            guardianEmail.trim() &&
            !resolvedLinkedFamily && (
              <p className="text-sm text-gray-600" role="status">
                {t('pages.enrolment.admin_new_family_hint')}
              </p>
            )}
          <input
            type="text"
            required
            className="form-input w-full"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder={t('form.person.name')}
            aria-label={t('form.person.name')}
          />
          {mode !== 'admin' && (
            <input
              type="email"
              required
              className="form-input w-full"
              value={guardianEmail}
              onChange={(e) => {
                setGuardianEmail(e.target.value);
                setForceExistingEmailPrompt(false);
              }}
              placeholder={t('form.person.email')}
              aria-label={t('form.person.email')}
            />
          )}
          {showGuardianExistingPrompt && onSignInRequest && (
            <GuestExistingAccountPrompt onSignIn={onSignInRequest} />
          )}
          <input
            type="tel"
            className="form-input w-full"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder={t('form.person.phone')}
            aria-label={t('form.person.phone')}
          />
        </fieldset>
      )}

      <fieldset className="border rounded p-4 space-y-3">
        <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
        <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder={t('form.person.name')} />
        <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} aria-label={t('form.person.date_of_birth')} />
        <SelectedClassAgeAlert
          {...ageAlert}
          dateOfBirth={studentDob}
          studentName={studentName || t('pages.enrolment.student_section')}
        />
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {mode !== 'guest' && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => {
            clearLinkedFamily();
            onBack();
          }}>
            {t('common.back')}
          </Button>
        )}
        {mode === 'guest' && onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          className="flex-1"
          disabled={
            isSubmitting ||
            showGuardianExistingPrompt ||
            guardianEmailChecking ||
            studentDobBlocked
          }
        >
          {isSubmitting ? t('common.loading') : t('common.next')}
        </Button>
      </div>
    </form>
  );
}
