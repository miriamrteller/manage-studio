import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SelectedClassAgeAlert } from '../../lib/selectedClassAgeValidation';
import type { GuardianProfile } from '../../onboardingService';
import type { SelectStudentFields } from '../../hooks/useSelectStudentFields';
import type { SelectStudentFormState, SharedAgeAlertProps } from './types';

/** A signed-in parent adds a new child to their own family. */
export function NewChildForm({
  guardian,
  fields,
  formState,
  ageAlert,
  studentDobBlocked,
  onCreateMinor,
  onBack,
}: {
  guardian: GuardianProfile | null;
  fields: SelectStudentFields;
  formState: SelectStudentFormState;
  ageAlert: SharedAgeAlertProps;
  studentDobBlocked: boolean;
  onCreateMinor: (fields: { student_name: string; student_date_of_birth: string }) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { studentName, setStudentName, studentDob, setStudentDob } = fields;
  const { error, setError, isSubmitting, setIsSubmitting } = formState;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (studentDobBlocked) return;
        setIsSubmitting(true);
        try {
          await onCreateMinor({ student_name: studentName, student_date_of_birth: studentDob });
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="text-sm text-gray-600">{t('pages.enrolment.new_child_desc')}</p>
      {guardian && (
        <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
          <p className="font-medium">{t('pages.enrolment.guardian_section')}</p>
          <p>{guardian.name}</p>
          {guardian.email && <p>{guardian.email}</p>}
          {guardian.phone && <p>{guardian.phone}</p>}
        </div>
      )}
      <fieldset className="border rounded p-4 space-y-3">
        <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
        <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} aria-label={t('form.person.name')} />
        <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} aria-label={t('form.person.date_of_birth')} />
        <SelectedClassAgeAlert
          {...ageAlert}
          dateOfBirth={studentDob}
          studentName={studentName || t('pages.enrolment.student_section')}
        />
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          {t('common.back')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="flex-1"
          disabled={
            isSubmitting ||
            studentDobBlocked
          }
        >
          {isSubmitting ? t('common.loading') : t('common.next')}
        </Button>
      </div>
    </form>
  );
}
