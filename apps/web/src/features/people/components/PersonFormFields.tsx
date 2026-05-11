import { type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { type Person } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { FormInput, FormTextarea, FormSelect } from '../../../components/Common';

interface PersonFormFieldsProps {
  register: UseFormRegister<Partial<Person>>;
  errors: FieldErrors<Partial<Person>>;
  person?: Partial<Person>;
}

/**
 * PersonFormFields: Renders all form field groups for person data
 * - Handles input rendering, error state styling, and labels
 * - Stateless — delegated to parent for form state management
 * - Keep under 150 lines per .instructions.md
 */

export const PersonFormFields = ({ register, errors, person }: PersonFormFieldsProps) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Full Name field — REQUIRED */}
      <FormInput
        htmlFor="name"
        label={t('form.person.name')}
        placeholder={t('form.person.name')}
        error={errors.name?.message}
        required
        {...register('name')}
      />

      {/* Email field */}
      <FormInput
        htmlFor="email"
        label={t('form.person.email')}
        type="email"
        placeholder="example@email.com"
        error={errors.email?.message}
        {...register('email')}
      />

      {/* Date of Birth field — format YYYY-MM-DD */}
      <FormInput
        htmlFor="date_of_birth"
        label={t('form.person.date_of_birth')}
        type="date"
        error={errors.date_of_birth?.message}
        {...register('date_of_birth')}
      />

      {/* Medical Notes field */}
      <FormTextarea
        htmlFor="medical_notes"
        label={t('form.person.medical_notes')}
        placeholder={t('form.person.medical_notes')}
        rows={3}
        error={errors.medical_notes?.message}
        {...register('medical_notes')}
      />

      {/* Allergies field */}
      <FormTextarea
        htmlFor="allergies"
        label={t('form.person.allergies')}
        placeholder={t('form.person.allergies')}
        rows={3}
        error={errors.allergies?.message}
        {...register('allergies')}
      />

      {/* Status field — enum dropdown */}
      <FormSelect
        htmlFor="status"
        label={t('form.person.status')}
        error={errors.status?.message}
        required
        {...register('status')}
      >
        <option value="">-- {t('common.select')} --</option>
        <option value="active">{t('form.person.status_active')}</option>
        <option value="inactive">{t('form.person.status_inactive')}</option>
        <option value="withdrawn">{t('form.person.status_withdrawn')}</option>
      </FormSelect>

      {/* Display computed field (is_minor) if person exists — read-only */}
      {person?.is_minor !== undefined && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-700">
            <strong>{t('form.person.is_minor_label')}:</strong>{' '}
            {person.is_minor ? t('common.yes') : t('common.no')}
          </p>
        </div>
      )}
    </>
  );
};
