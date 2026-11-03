import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { isExistingEmailError } from '../../intakeService';
import { SelectedClassAgeAlert } from '../../lib/selectedClassAgeValidation';
import type { EnrolmentMode } from '../../hooks/useEnrolmentContext';
import type { SelectStudentFields } from '../../hooks/useSelectStudentFields';
import { GuestExistingAccountPrompt } from '../GuestExistingAccountPrompt';
import type { SelectStudentFormState, SharedAgeAlertProps } from './types';

/** An adult enrolling themselves (asks for a guardian if the date of birth shows under 18). */
export function NewAdultForm({
  mode,
  fields,
  formState,
  ageAlert,
  adultDobBlocked,
  adultAge,
  adultNeedsGuardian,
  showAdultExistingPrompt,
  adultEmailChecking,
  onCreateAdult,
  onCreateMinorWithGuardian,
  onBack,
  onCancel,
  onSignInRequest,
}: {
  mode: EnrolmentMode;
  fields: SelectStudentFields;
  formState: SelectStudentFormState;
  ageAlert: SharedAgeAlertProps;
  adultDobBlocked: boolean;
  adultAge: number;
  adultNeedsGuardian: boolean;
  showAdultExistingPrompt: boolean;
  adultEmailChecking: boolean;
  onCreateAdult: (fields: {
    name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
  }) => Promise<void>;
  onCreateMinorWithGuardian: (fields: {
    student_name: string;
    student_date_of_birth: string;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
  }) => Promise<void>;
  onBack: () => void;
  onCancel?: () => void;
  onSignInRequest?: () => void;
}) {
  const { t } = useTranslation();
  const {
    adultName,
    setAdultName,
    adultEmail,
    setAdultEmail,
    adultPhone,
    setAdultPhone,
    adultDob,
    setAdultDob,
    guardianName,
    setGuardianName,
    guardianEmail,
    setGuardianEmail,
    guardianPhone,
    setGuardianPhone,
  } = fields;
  const { error, setError, isSubmitting, setIsSubmitting, setForceExistingEmailPrompt } = formState;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setForceExistingEmailPrompt(false);
        if (showAdultExistingPrompt) return;
        if (adultDobBlocked) return;
        setIsSubmitting(true);
        try {
          if (adultNeedsGuardian) {
            await onCreateMinorWithGuardian({
              student_name: adultName,
              student_date_of_birth: adultDob,
              guardian_name: guardianName,
              guardian_email: guardianEmail || undefined,
              guardian_phone: guardianPhone || undefined,
            });
            return;
          }
          await onCreateAdult({
            name: adultName,
            email: adultEmail || undefined,
            phone: adultPhone || undefined,
            date_of_birth: adultDob || undefined,
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
          ? t('pages.enrolment.guest_adult_desc')
          : t('pages.enrolment.new_adult_desc')}
      </p>
      <fieldset className="border rounded p-4 space-y-3">
        <legend className="text-sm font-semibold px-1">{t('pages.enrolment.personal_section')}</legend>
        <input
          type="text"
          required
          className="form-input w-full"
          value={adultName}
          onChange={(e) => setAdultName(e.target.value)}
          placeholder={t('form.person.name')}
        />
        <input
          type="email"
          required={mode === 'guest'}
          className="form-input w-full"
          value={adultEmail}
          onChange={(e) => {
            setAdultEmail(e.target.value);
            setForceExistingEmailPrompt(false);
          }}
          placeholder={t('form.person.email')}
        />
        {showAdultExistingPrompt && onSignInRequest && (
          <GuestExistingAccountPrompt onSignIn={onSignInRequest} />
        )}
        <input
          type="tel"
          className="form-input w-full"
          value={adultPhone}
          onChange={(e) => setAdultPhone(e.target.value)}
          placeholder={t('form.person.phone')}
        />
        <input
          type="date"
          className="form-input w-full"
          value={adultDob}
          onChange={(e) => setAdultDob(e.target.value)}
          placeholder={t('form.person.date_of_birth')}
          aria-label={t('form.person.date_of_birth')}
        />
        {adultDob && !Number.isNaN(adultAge) && (
          <p
            className={[
              'inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium',
              adultNeedsGuardian
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-green-300 bg-green-50 text-green-800',
            ].join(' ')}
            role="status"
          >
            {adultNeedsGuardian
              ? t('pages.enrolment.status_minor', { defaultValue: 'Minor - guardian required' })
              : t('pages.enrolment.status_adult', { defaultValue: 'Adult - no guardian needed' })}
          </p>
        )}
        <SelectedClassAgeAlert
          {...ageAlert}
          dateOfBirth={adultDob}
          studentName={adultName || t('pages.enrolment.personal_section')}
        />
      </fieldset>
      {adultNeedsGuardian && (
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.guardian_section')}</legend>
          <p className="text-sm text-gray-600">
            {t('pages.enrolment.minor_requires_guardian', {
              defaultValue: 'Student is under 18. Please add guardian details.',
            })}
          </p>
          <input
            type="text"
            required
            className="form-input w-full"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder={t('form.person.name')}
          />
          <input
            type="email"
            required
            className="form-input w-full"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            placeholder={t('form.person.email')}
          />
          <input
            type="tel"
            className="form-input w-full"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder={t('form.person.phone')}
          />
        </fieldset>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {mode !== 'guest' && (
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
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
            showAdultExistingPrompt ||
            adultEmailChecking ||
            adultDobBlocked
          }
        >
          {isSubmitting ? t('common.loading') : t('common.next')}
        </Button>
      </div>
    </form>
  );
}
