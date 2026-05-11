import { type UseFormRegister, type Path, type FieldErrors } from 'react-hook-form';
import { type Person } from '@shared/schemas';
import { useTranslation } from 'react-i18next';

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

  const getFieldClassName = (hasError: boolean): string =>
    `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-500' : 'border-gray-300'
    }`;

  const getErrorMessage = (fieldName: Path<Partial<Person>>): string | null =>
    errors[fieldName]?.message || null;

  return (
    <>
      {/* Full Name field — REQUIRED */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.name')} *
        </label>
        <input
          id="name"
          type="text"
          placeholder={t('form.person.name')}
          className={getFieldClassName(Boolean(errors.name))}
          {...register('name')}
          required
        />
        {getErrorMessage('name') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('name')}
          </span>
        )}
      </div>

      {/* Email field */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.email')}
        </label>
        <input
          id="email"
          type="email"
          placeholder="example@email.com"
          className={getFieldClassName(Boolean(errors.email))}
          {...register('email')}
        />
        {getErrorMessage('email') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('email')}
          </span>
        )}
      </div>

      {/* Date of Birth field — format YYYY-MM-DD */}
      <div>
        <label
          htmlFor="date_of_birth"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.date_of_birth')}
        </label>
        <input
          id="date_of_birth"
          type="date"
          className={getFieldClassName(Boolean(errors.date_of_birth))}
          {...register('date_of_birth')}
        />
        {getErrorMessage('date_of_birth') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('date_of_birth')}
          </span>
        )}
      </div>

      {/* Medical Notes field */}
      <div>
        <label
          htmlFor="medical_notes"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.medical_notes')}
        </label>
        <textarea
          id="medical_notes"
          placeholder={t('form.person.medical_notes')}
          className={getFieldClassName(Boolean(errors.medical_notes))}
          rows={3}
          {...register('medical_notes')}
        />
        {getErrorMessage('medical_notes') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('medical_notes')}
          </span>
        )}
      </div>

      {/* Allergies field */}
      <div>
        <label
          htmlFor="allergies"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.allergies')}
        </label>
        <textarea
          id="allergies"
          placeholder={t('form.person.allergies')}
          className={getFieldClassName(Boolean(errors.allergies))}
          rows={3}
          {...register('allergies')}
        />
        {getErrorMessage('allergies') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('allergies')}
          </span>
        )}
      </div>

      {/* Status field — enum dropdown */}
      <div>
        <label
          htmlFor="status"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.person.status')} *
        </label>
        <select
          id="status"
          className={getFieldClassName(Boolean(errors.status))}
          {...register('status')}
          required
        >
          <option value="">-- {t('common.select')} --</option>
          <option value="active">{t('form.person.status_active')}</option>
          <option value="inactive">
            {t('form.person.status_inactive')}
          </option>
          <option value="withdrawn">
            {t('form.person.status_withdrawn')}
          </option>
        </select>
        {getErrorMessage('status') && (
          <span className="text-sm text-red-600 mt-1 block">
            {getErrorMessage('status')}
          </span>
        )}
      </div>

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
