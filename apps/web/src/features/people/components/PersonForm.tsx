import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PersonSchema, type Person } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

// Schema source: SPEC.md Migration 002
// Columns: id, tenant_id, family_id, user_profile_id, name, email, date_of_birth, is_minor,
//   medical_notes, allergies, status, created_at
// Notes:
// - System fields (id, tenant_id, family_id, user_profile_id) are NOT in form, added at submission
// - is_minor is read-only computed field (display only, not form input)
// - date_of_birth format: YYYY-MM-DD (ISO date)

interface PersonFormProps {
  person?: Partial<Person>;
  onSubmit: (data: Partial<Person>) => Promise<void>;
  isLoading?: boolean;
}

export const PersonForm = ({ person, onSubmit, isLoading }: PersonFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Use partial schema to allow editing (some fields can be null/undefined)
  const form = useForm({
    resolver: zodResolver(PersonSchema.partial()),
    defaultValues: person || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Person>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      // Reset form after successful submission if creating new
      if (!person) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('common.error')
      );
    }
  };

  const isCreating = !person?.id;

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 p-4"
      dir="rtl"
    >
      {/* Error message */}
      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {submitError}
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700">
          {isCreating
            ? t('common.success_created')
            : t('common.success_updated')}
        </div>
      )}

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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.name
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('name')}
          required
        />
        {form.formState.errors.name && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.name.message}
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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.email
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.email.message}
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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.date_of_birth
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('date_of_birth')}
        />
        {form.formState.errors.date_of_birth && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.date_of_birth.message}
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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.medical_notes
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          rows={3}
          {...form.register('medical_notes')}
        />
        {form.formState.errors.medical_notes && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.medical_notes.message}
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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.allergies
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          rows={3}
          {...form.register('allergies')}
        />
        {form.formState.errors.allergies && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.allergies.message}
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
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.status
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('status')}
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
        {form.formState.errors.status && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.status.message}
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

      {/* Form buttons */}
      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isLoading || form.formState.isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading || form.formState.isSubmitting
            ? t('common.loading')
            : isCreating
              ? t('common.create')
              : t('common.save')}
        </button>
        <button
          type="reset"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
        >
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
};
